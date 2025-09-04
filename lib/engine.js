/*
 * Copyright 2020 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

'use strict';

//const debug = require('debug')('pipeline:engine');
const debug = console.log;
const PlanFinder = require('./plan-finder');
const { Plan, PLAN_STATE } = require('./plan');
const Asset = require('./asset');
const { Rendition } = require('./rendition');
const { Utils } = require('./utils');
const Metadata = require('./metadata');

const { Prepare } = require('../lib/prepare');
const { Storage } = require('./storage');
const { TemporaryCloudStorage } = require('./storage/temporary-cloud-storage');

const { GenericError, AssetComputeEvents, OpenwhiskActionName, Reason, AssetComputeLogUtils, SourceUnsupportedError } = require('@adobe/asset-compute-commons');

const { TransformerContext } = require('./context/transformer-context');
const { EngineContext } = require('./context/engine-context');
// get utils
const datauri = require('./storage/datauri');

const validUrl = require('valid-url');
const validDataUrl = require('valid-data-url');

const EVENT_RENDITION_CREATED = "rendition_created";
const EVENT_RENDITION_FAILED = "rendition_failed";
const METRIC_RENDITION = "rendition";
const CLEANUP_FAILED_EXIT_CODE = 100;

// holds private member fields
const INTERNAL = Symbol("internal");
const TransformerSourceType = {
    URL: 'URL',
    LOCAL: 'LOCAL'
};

const ALLOWED_USER_DATA_FIELDS = new Set([
    'assetUuid', 'assetPath', 'eventHandlerId', 'repositoryId', 'name', 'uploadToken'
]);

/**
 * Component containing information about the pipeline needed to produce a rendition.
 */
class Engine {
    constructor(params) {
        debug('new Engine()');
        this[INTERNAL] = {};
        this[INTERNAL].registry = {};
        this[INTERNAL].params = params || {};
        this[INTERNAL].params.times = this[INTERNAL].params.times || {};
        this[INTERNAL].context = new EngineContext(this, this[INTERNAL].params);

        // action name
        this[INTERNAL].actionName = new OpenwhiskActionName().name;

        // get events
        this[INTERNAL].events = new AssetComputeEvents(this[INTERNAL].params);
    }

    /**
     * Wrap existing error as GenericError if necessary, otherwise pass known error thru as-is
     * TODO: Move to commons and find a better name for this
     * @param {Thrown error} sourceError if known, can be null but it's more useful if it isn't 
     * @param {*} message Error message to throw if source error is not generic error 
     * @param {*} location Location message to throw if source error is not generic error
     * @returns 
     */
    wrapError(sourceError, message, location) {
        if (!(sourceError instanceof GenericError) && (!sourceError.reason
            || !Object.values(Reason).includes(sourceError.reason))) {
            return new GenericError(`${message}: ${sourceError.message || sourceError}`, location);
        }
        return sourceError;
    }

    /**
     * Run Pipeline
     */
    async run(plan) {
        if (!plan || !(plan instanceof Plan)) {
            const message = 'Pipeline engine did not get a valid plan';
            debug(message);
            throw new GenericError(message, 'pipelineRun');
        }

        let finalOutput;

        try {
            debug(`Running the plan: ${plan}`);
            // run loop: executes steps one after the others
            let currentStep = plan.current;
            this.stepCount = 0; // step counter for folder naming and debugging

            // special case at the start
            // TODO: revisit when we go over design with core
            if (currentStep.start) {
                currentStep = plan.advance();
            }

            while (plan.state === PLAN_STATE.IN_PROGRESS) {
                const previousOutput = await this.executeTransformer(plan);
                finalOutput = previousOutput; // after last step, will contain the rendition

                // set the output of the previous step to be the input for the next step
                currentStep = this.updateNextStep(plan, previousOutput);
                debug('plan: %s', plan);
            }

            // optional upload
            if (plan.state === PLAN_STATE.SUCCEEDED) {
                await this.upload(finalOutput);
            }
            debug(`no more steps, execution finished.`);

        } catch (error) {
            // note specific failures will be thrown inside engine methods
            // errors here are typically developer errors or other oncaught system errors
            debug("Error occurred, aborting current plan: ", error);
            await this[INTERNAL].context.metrics.handleError(error);
            throw this.getResult(finalOutput, error); // TODO: pass transformerContext instead of passing result
        } finally {
            // remove temporary files
            await this.cleanup(finalOutput);
        }
        return this.getResult(finalOutput);
    }

    /**
     * Execute Transformer
     * 
     * @param {Step} step Current step in the Plan containing the transformer name and an object of attributes
     * Example:
     *  { 
            name: transformerName,
            attributes: {
                input: {},
                output: {}
            }
        }
     */
    async executeTransformer(plan) {
        const step = plan.current;
        const transformerName = step.name;
        debug(`executing step: ${transformerName}`);
        if (!Object.keys(this[INTERNAL].registry).length === 0) {
            // developer error, will be caught and handled in outer try/catch
            throw new GenericError(`No transformer in registry ${transformerName}`, `${transformerName}_executeTransformer`);
        }

        const transformer = this[INTERNAL].registry[transformerName];
        if (!transformer) {
            // developer error, will be caught and handled in outer try/catch
            throw new GenericError(`Unknown Transformer: Transformer ${transformerName} not found in the registry`, `${transformerName}_executeTransformer`);
        }

        const transformerContext = new TransformerContext(plan, plan.current, transformer);
        transformerContext.originalInput = plan.originalInput;

        try {
            // prepare updates transformerContext with input and output
            await this.prepare(transformerContext);
            await transformer.compute(transformerContext.input, transformerContext.output, transformerContext);
            
            // check if output was created
            // TODO: this.options.disableRenditionUpload
            // note: none of the transformers we are integrating for V1 of the pipeline use disableRenditionUpload
            // we should implement something similar to what we did for disableSourceDownload:
            // - remove this option and define it in the manifest.inputs as `sourceType` = `URL` or `LOCAL`
            if (!transformerContext.output.exists()) {
                console.log(`No output found after transformer.compute processing: ${transformerContext.output.path || transformerContext.output.url}`);
                throw new GenericError(`No rendition generated for ${transformerContext.output.id()}`, `${transformerName}_executeTransformer_norendition`);
            }

            debug(`Transformer ${transformerName} executed successfully`);
            return transformerContext.output;
        } catch (error) {
            // make sure to log full stack trace for debugging
            debug(error);
            // entire plan must be marked as failed
            plan.fail();
            // future, continue with next rendition/plan in executeTransformer()

            // ensure a GenericError is thrown if no asset compute specific error is used
            const wrappedError = this.wrapError(error, `Transformer ${transformerName} failed`, `${transformerName}_executeTransformer`);
            await this.renditionFailure(transformerContext.output, wrappedError);
        }
        return transformerContext.output;
    }

    registerTransformer(transformer) {
        // TODO: validateTransformer()
        // validate its instanceof transformer, maybe follows normal patterns for manifest
        // transformer must have: name, manifest, compute() function
        // log error and skip registering if its invalid
        if (this[INTERNAL].registry[transformer.name]) {
            debug(`Transformer with name ${transformer.name} already exists. Replacing current transformer`);
        }
        this[INTERNAL].registry[transformer.name] = transformer;
        debug('Added transformer:', transformer.name);
    }

    /**
     * Get metadata of an asset
     * Image asset will be downloaded in this step for metadata extraction need
     * @param {*} source
     */
    async getMetadata(source) {
        const meta = new Metadata(source);
        // download source (resuse code in prepare)
        // Problem: we need to download the asset for getting metadata unless there's 
        //          a way to get metadata without downloading the whole file.
        if (!meta.isVideo() && !meta.isTextTranscriptable() && !source.path) {
            debug("asset path not available for image asset : download asset");
            this[INTERNAL].context.timers.download.start();
            // download input to <baseDirectory>/inputfile and set source.path
            const asset = await Storage.getSource(source, this[INTERNAL].context.baseDirectory, false);
            this[INTERNAL].context.timers.download.stop();
            source.path = asset.path;
        }
        await meta.extract();

        return meta;
    }

    /**
     * Refines a plan
     * (To create a new plan: refines an empty plan)
     * If no valid plan is found, an IO error event is sent to the client
     *
     * Validations:
     * - we don't validate there is no cycle, but we limit max. nodes we go through to 100 steps
     * @param {Plan} plan plan to refine (required)
     * @param {Asset} source source contains metadata about the input (eg. mimetype, width, height, colorspace, ...), url, etc. (required)
     * @param {Rendition} outputInstructions contains the instructions about the desired output (rendition) (required)
     */
    async refinePlan(plan, source, outputInstructions) {
        try {
            // skipMetadataExtraction is used by unit tests with dummy asset path or url
            if (!this[INTERNAL].params.skipMetadataExtraction) {
                const assetMetadata = await this.getMetadata(source);
                Object.assign(source, assetMetadata.metadata);
                AssetComputeLogUtils.log(source, 'Input for refinePlan with metadata:');
            }

            // TODO-mob : make sure source metadata is here: width, height 
            plan.updateOriginalInput(source);
            const newSteps = new PlanFinder(this[INTERNAL].registry).findBestPlan(source, outputInstructions);
            if (!newSteps) {
                // TODO: throw these errors inside plan alg so they can be more specific
                // throw RenditionFormatUnsupportedError(`No transformers supported for ${outputInstructions.type}`)
                // internal-repo/nui/core/blob/master/lib/workers.js#L342
                throw new GenericError('No valid plan found.', 'refinePlan');
            }
            for (let i = 0; i < newSteps.length; i++) {
                plan.add(newSteps[i].name, newSteps[i].attributes);
            }
        } catch (error) {
            debug(`refinePlan did not find a valid plan: ${error.message || error}`);
            // note: this will replace the core worker selection errors: internal-repo/nui/core/blob/master/lib/select-workers.js#L43-L65
            // TODO: move into generic function

            // stop processingTime timer
            this[INTERNAL].context.timers.processingTime.stop();

            // worker tests in the cli rely on these errors being in renditionErrors
            this[INTERNAL].context.renditionErrors.push(error);
            await this[INTERNAL].context.metrics.handleError(error, {
                location: `${this[INTERNAL].actionName}_refinePlan`,
                metrics: {
                    // rendition instructions
                    ...outputInstructions,
                    renditionName: outputInstructions.name,
                    renditionFormat: outputInstructions.fmt,
                    // durations
                    processingTime: this[INTERNAL].context.timers.processingTime.currentDuration()
                }
            });
            await this[INTERNAL].events.sendEvent(EVENT_RENDITION_FAILED, {
                rendition: Rendition.redactInstructions(outputInstructions),
                errorReason: error.reason || Reason.GenericError,
                errorMessage: error.message || error || "No valid plan found.",
            });

            // note: when the pipeline supports multiple renditions and mutliple plans, we may not want to throw here
            // we may want to send events/metrics and move on gracefully to the next rendition
            // so we fail the plan and gracefully return
            // subsequent calls to `engine.run(plan)` don't do anything
            plan.fail();
            return plan;
        }
    }

    /**
     * TransformerContext
     * @param {Step} step Current step in the Plan containing the transformer name and an object of attributes
     * @param {Transformer} transformer Current transformer executing this step
     * 
     * Note: In the simplest case, this resembles the raw request we see from AEM
     * - step.attributes.input -> params.source
     * - step.attributes.output -> params.renditions[i]
     * Example:
     *  { 
            name: transformerName,
            attributes: {
                input: {
                    {
                        type: 'image/png',
                        path: 'path to local file'
                        url: "https url to source file" // in case its first step and opted out of initial download, for example: ffmpeg-thumbnail skips download
                    }
                },
                output: {
                    type: 'image/png',
                    fmt: 'png, // for backwards compatibility
                    target: [ 'urls' ] // only necessary if output needs to be uploaded (aka final rendition)
                    width: 100,
                    // ...other instructions specific to the transformer
                    // Note: there is no `path` attribute defined yet.
                    // This gets defined when we create the output object (Rendition class) to pass to the compute fn
                }
            }
        }
     */
    /**
     * Prepare transformer for compute method
     * - Create unique working directory for the transformer
     * - Convert step.attributes into input (Asset) and output (Rendition) objects
     * - Store these input and output objects on the transformerContext
     * @param {TransformerContext} transformerContext Object container context about the current transformer
     */
    async prepare(transformerContext) {
        // Note: any failure to prepare should throw and fail this function

        //  Create directories unique for each transformer:
        //  <baseDirectory>
        //          /<stepNumber>-<transformerName>
        //  For example:
        //  work/1232445/0-MyTransformer
        const step = transformerContext.step;
        const transformer = transformerContext.transformer;
        debug("Preparing directories");

        // TODO: this will be in transformer context
        const transformerDirectory = await Prepare.createDirectories(`${this.stepCount}-${transformer.name}`, this[INTERNAL].context.baseDirectory);
        this[INTERNAL].context.transformerDirectories.push(transformerDirectory);

        // TODO: make sure intermediate urls are read/write

        const { input, output } = step.attributes;
        debug("Raw input from Plan: %s", AssetComputeLogUtils.redactUrl(input));
        debug("Raw output from Plan: %s", AssetComputeLogUtils.redactUrl(output));

        // create output object (type Rendition for now)
        // create renditions before attempting download in case download fails
        transformerContext.output = new Rendition(output, transformerDirectory.base);
        /**
         * For 1st sdk call
         * input: {
                type: 'image/png',
                url: 'https://azure/assetpath'
            }
         * 
            For other calls:
         * const attributes = {
            input: {
                type: 'image/png',
                path: './test/files/red_dot_alpha0.5.png'
            },
            output: {
                type: "image/png",
                width: 319,
                height: 319,
                target: 'intermediateOutput.png'
            }};

            OR

            const imgMgkAttributes = {};
            imgMgkAttributes.input = {
                type: 'image/png',
                path: './test/files/red_dot_alpha0.5.png'
            };
            //{type: "image/png"};
            // TODO merge Asset & Rendition into an Output class
            imgMgkAttributes.output =
            {
                type: "image/png",
                width: 319,
                height: 319,
                target: 'intermediateOutput.png'
            };

         */
        // create input object (type Asset)
        let transformerInput = {};
        if (input && !input.url && !input.path) {
            throw new GenericError("No source file accessible.", "prepareTransformer");
        }

        let protocol = "";
        if (input.url) {
            if (!validDataUrl(input.url) && !validUrl.isHttpsUri(input.url)) {
                throw new SourceUnsupportedError(`${input.url} must be a valid https url or datauri`);
            }
            protocol = new URL(input.url).protocol;
        }

        debug(`sourceType: ${input.sourceType}`);
        if (input.sourceType === TransformerSourceType.URL) {
            if (input.url && (protocol === 'https:')) {
                debug("asset url available : dont need to do anything");
                transformerInput = new Asset(input);
            } else if (input.url && protocol === 'data:') {
                debug("asset url available as data URI : upload asset to a temp cloud storage and generate a presigned URL");
                transformerInput = await Storage.getSource(input, transformerDirectory.base, true);
            } else {
                debug("asset url not available : generated presigned url");
                try {
                    const preSignedUrl = await datauri.getPreSignedUrl(input.path);
                    input.url = preSignedUrl;
                    transformerInput = new Asset(input, input.path);
                } catch (error) {
                    console.log(error);
                    throw new GenericError("Fail generating presigned url.", "prepareTransformer");
                }
            }
        } else { // defaults to assuming the asset is needed locally, treated as sourceType === 'LOCAL'
            if (input.path) {
                debug("asset path available : dont need to do anything");
                transformerInput = new Asset(input, input.path);
            } else {
                debug("asset path not available : download asset");
                // TODO: metric here is not really accurate when input.url is datauri, 
                //       because it also includes upload duration
                this[INTERNAL].context.timers.download.start();
                // download input to <baseDirectory>/<stepNumber>-<transformerName>/inputfile and set input.path
                transformerInput = await Storage.getSource(input, transformerDirectory.base, false);
                this[INTERNAL].context.timers.download.stop();
            }
        }        
        transformerContext.input = transformerInput;
        transformerContext.input.auth = this[INTERNAL].params.auth || {};

        const { firefallClientId, firefallClientSecret, firefallAuthCode, firefallTier, azureOpenAiApiKey, imsClientId, imsClientSecret, imsCode } = this[INTERNAL].params;
        if (firefallClientId || firefallClientSecret || firefallAuthCode || firefallTier) {
            transformerContext.input.auth.firefall = { firefallClientId, firefallClientSecret, firefallAuthCode, firefallTier };
        }

        if (azureOpenAiApiKey) {
            transformerContext.input.auth.azure = transformerContext.input.auth.azure || {};
            transformerContext.input.auth.azure.openaiapikey = azureOpenAiApiKey;
        }

        if (imsClientId || imsClientSecret || imsCode) {
            transformerContext.input.auth.ims = { imsClientId, imsClientSecret, imsCode };
        }

        // Pass through userData (contains assetUuid and repositoryId)  
        if (this[INTERNAL].params.userData) {
            transformerContext.input.userData = filterUserData(this[INTERNAL].params.userData);
        }

        // Pass through requestId
        transformerContext.input.requestId = this[INTERNAL].params.requestId;

    }

    /**
     * Advance the plan
     * Set the output of the previous step to be the input for the next step
     * @param {Plan} plan 
     * @param {Rendition} previousOutput 
     */
    updateNextStep(plan, previousOutput) {
        const currentStep = plan.advance();
        this.stepCount++;
        // if currentStep is null or undefined, we are at the end of the plan
        if (currentStep && previousOutput) {
            if (previousOutput.path) {
                // TODO: we should not be manipulating/changing the input/output parameters directly
                // when we change the input, we should not be changing the plan directly
                // we should refactor this to only change the `Asset` object
                currentStep.attributes.input.path = previousOutput.path;
                // make sure the size attribute is correct for the next source
                currentStep.attributes.input.size = previousOutput.size();
                debug("passed on current step input path :", currentStep.attributes.input.path);
            }
            if (previousOutput.url) {
                // if T uploaded rendition then pass on the output url as input to next T  
                currentStep.attributes.input.url = previousOutput.url;
                debug("passed on current step input url :", currentStep.attributes.input.url);
            }
        } else if (currentStep && !previousOutput) {
            // throw error if no previous output and there is a current next step
            // note, this is handled inside `executeTransformer` but keep this as a backup
            // this error would likely only happen in developing a transformer and it is invalid
            throw new GenericError(`Previous Transformer did not return an output: ${previousOutput}`, 'runPlan');
        }
        return currentStep;
    }

    /**
     * Upload final output to target urls
     * @param {Rendition} output final output to be uploaded to output.target
     */
    async upload(output) {
        try {
            // call HTTP upload using outputInstructions
            // TODO: this.options.disableRenditionUpload
            // note: none of the transformers we are integrating for V1 of the pipeline use disableRenditionUpload
            // we should implement something similar to what we did for disableSourceDownload:
            // - remove this option and define it in the manifest.inputs as `sourceType` = `URL` or `LOCAL`
            debug(`output rendition: ${AssetComputeLogUtils.redactUrl(output)}`);

            this[INTERNAL].context.timers.upload.start();

            await Storage.putRendition(output);

            this[INTERNAL].context.timers.upload.stop();

            // send success
            await this.renditionSuccess(output);
        } catch (error) {
            // if upload fails, send errors and continue with next rendition/plan
            await this.renditionFailure(output, error);
        }
    }

    /**
     * Clean up temporary files produced during the pipeline
     * @param {Rendition|Object} finalOutput finalOutput Rendition or object or undefined depending on if engine.run fails
     */
    async cleanup(finalOutput) {

        // Current behavior:
        // - run clean up once after entire plan is complete
        // (this means files live in the pipeline forever taking up diskspace until the end
        // ...unless the transformer removes them theirselves)

        // Optimization ideas:
        // 1. iterative approach:
        // first, transformers that use a lot of disk space code in their own cleanup mechanism 
        // inside the compute() fn or an optional transformer cleanup() method
        // then implement "smart" generate clean up after each transformer in the engine
        // 2. delete transformer folders after the step after it runs (working under the assumption 
        // that files are only needed for step directly after and can be discarded after that)
        // 3. keep running list at engine level of files not to remove. remove everything else after each transformer

        // Notes:
        // - cleanup might run at any time, so no assumptions to be made of existence of objects
        // - all these steps should individually catch errors so that all cleanup steps can run

        // optional path to where final rendition is stored (only applies to WORKER_TEST_MODE)
        const finalOutputPath = finalOutput && finalOutput.path;
        const cleanupSuccess = await Prepare.cleanupDirectories(this[INTERNAL].context.transformerDirectories, finalOutputPath);

        // extra protection: ensure failure events are sent for any non successful rendition
        // for (const rendition of this.renditions) {
        if (finalOutput && !finalOutput.eventSent) {
            let instructions;
            if (finalOutput instanceof Rendition) {
                instructions = finalOutput.instructionsForEvent();
            } else {
                instructions = Rendition.redactInstructions(finalOutput);
            }

            await this[INTERNAL].events.sendEvent(EVENT_RENDITION_FAILED, {
                rendition: instructions,
                errorReason: Reason.GenericError,
                errorMessage: "Unknown error"
            });
            finalOutput.eventSent = true;
        }
        // }

        // add final metrics (for activation metric)
        this[INTERNAL].context.metrics.add({
            // durations
            processingTime: this[INTERNAL].context.timers.processingTime.totalDuration(),
            downloadDuration: this[INTERNAL].context.timers.download.totalDuration(),
            uploadDuration: this[INTERNAL].context.timers.upload.totalDuration()
        });

        let temp;
        try {
            temp = new TemporaryCloudStorage(this[INTERNAL].params);
        } catch (error) {
            debug(`failed to initialize temporary cloud files clean-up: ${error.message || error}`);
        }

        if(temp){
            for (const file of this[INTERNAL].context.tempCloudStorageFiles) {
                try {
                    await temp.cleanUp(file);
                } catch(err) {
                    debug(`removing temporary cloud storage file ${file} failed: ${err.message}. Trying to continue clean up anyway...`);
                }
            }
        }

        // if data clean up fails (leftover directories),
        // we kill the container to avoid data leak
        if (!cleanupSuccess && !process.env.WORKER_TEST_MODE) {
            // might want to avoid exit when unit testing...
            console.log("Cleanup was not successful, killing container to prevent further use for action invocations");
            process.exit(CLEANUP_FAILED_EXIT_CODE);
        }
    }

    getResult(output, err) {
        // make sure to not return urls, customer data or credentials
        const result = {
            requestId: this[INTERNAL].params.requestId,
        };

        if (this[INTERNAL].context.renditionErrors.length > 0) {
            result.renditionErrors = this[INTERNAL].context.renditionErrors;
        }

        if (err) {
            return Object.assign(err, result);
        } else {
            return result;
        }

    }

    async renditionFailure(rendition, err, skipMetrics) {

        this[INTERNAL].context.renditionErrors.push(err);

        if (rendition.eventSent) {
            return;
        }

        const instructions = rendition.instructionsForEvent();
        const renditionDoneTime = new Date();

        // send failed IO event
        await this[INTERNAL].events.sendEvent(EVENT_RENDITION_FAILED, {
            rendition: instructions,
            errorReason: (err && err.reason) || Reason.GenericError,
            errorMessage: err ? (err.message || err) : undefined
        });

        // send failure IO event
        rendition.eventSent = true;

        // send metrics
        if (!skipMetrics) {
            // stop processingTime timer
            this[INTERNAL].context.timers.processingTime.stop();

            // one metric per failed rendition
            await this[INTERNAL].context.metrics.handleError(err, {
                location: (err && err.location) || `${this[INTERNAL].actionName}_process`,
                metrics: {
                    // rendition instructions
                    ...instructions,
                    renditionName: instructions.name,
                    renditionFormat: instructions.fmt,
                    // durations
                    processingTime: this[INTERNAL].context.timers.processingTime.currentDuration(),
                    downloadDuration: this[INTERNAL].context.timers.download.currentDuration(),
                    uploadDuration: this[INTERNAL].context.timers.upload.currentDuration(),
                    renditionDuration: Utils.durationSec(this[INTERNAL].context.processingStartTime, renditionDoneTime)
                }
            });
        }
    }

    async renditionSuccess(rendition) {
        if (rendition.eventSent) {
            return;
        }

        const renditionDoneTime = new Date();
        const instructions = rendition.instructionsForEvent();

        // send successful IO event
        await this[INTERNAL].events.sendEvent(EVENT_RENDITION_CREATED, {
            rendition: instructions,
            metadata: await rendition.metadata(),
            data: rendition.shouldEmbedInIOEvent() ? (await rendition.asDataUri()) : undefined
        });

        rendition.eventSent = true;

        // stop processingTime timer
        this[INTERNAL].context.timers.processingTime.stop();

        // send metrics
        await this[INTERNAL].context.metrics.sendMetrics(METRIC_RENDITION, {
            // rendition instructions
            ...instructions,
            renditionName: instructions.name,
            renditionFormat: instructions.fmt,
            // durations
            processingTime: this[INTERNAL].context.timers.processingTime.currentDuration(),
            renditionDuration: Utils.durationSec(this[INTERNAL].context.processingStartTime, renditionDoneTime),
            downloadDuration: this[INTERNAL].context.timers.download.currentDuration(),
            uploadDuration: this[INTERNAL].context.timers.upload.currentDuration(),
            // rendition metadata
            size: rendition.size()
        });
    }
}

/**
 * Filters userData to only include allowed fields
 * @param {Object} userData - The userData object to filter
 * @returns {Object} - Filtered userData object with only allowed fields
 */
function filterUserData(userData) {
    if (!userData || typeof userData !== 'object') {
        return userData;
    }

    const filtered = {};
    for (const [key, value] of Object.entries(userData)) {
        if (ALLOWED_USER_DATA_FIELDS.has(key)) {
            filtered[key] = value;
        } else {
            debug(`Filtered out userData field: ${key}`);
        }
    }
    
    return filtered;
}

module.exports = Engine;
