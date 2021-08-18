/*
 * Copyright 2021 Adobe. All rights reserved.
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

//const debug = require('debug')('pipeline:planFinder');
const debug = console.log;
const TransformersGraph = require('./transformer-graph');
const { getImageMetadata } = require('./metadata');
const { manifestIntersection, checkInputMatches, bestOfIntersection } = require('./plan-finder-utils');
const { SourceCorruptError, RenditionFormatUnsupportedError } = require('@adobe/asset-compute-commons');
const clone = require('clone');

// holds private member fields
// const INTERNAL = Symbol("internal");
const MAX_STEP_COUNT = 300;

/**
 * Component containing algorithm to find plan based on available transformers
 */
class PlanFinder {
    constructor(registry) {
        debug('new PlanFinder()');
        // this[INTERNAL] = {};
        // this[INTERNAL].registry = {};
        this.registry = registry;
        this.registeredTransformers = Object.keys(this.registry);
    }

    /**
     * Create graph/s based on registered transformers
     */
    formGraph() {
        this.graph = new TransformersGraph();
        this.registeredTransformers.forEach(currentTransformer => {
            this.graph.addNode(currentTransformer); // does nothing if node has already been added
            this.registeredTransformers.forEach(otherTransformer => {
                if (currentTransformer !== otherTransformer) {
                    // check if there is an edge between the transformers
                    // Transformers A,B intersect if A.outputs has at least one attribute that matches B.inputs
                    const intersection = manifestIntersection(this.registry[currentTransformer].outputs, this.registry[otherTransformer].inputs);
                    // Specific to pipeline: Transformers must have at least 1 overlap in attribute `type` to intersect
                    if (Object.keys(intersection).length > 0 && intersection.type) {
                        this.graph.addEdge(currentTransformer, otherTransformer, intersection); // add directed edge from a -> b
                    }
                }
            });
        });
    }
    /**
     * Determines if transformerA has a directed edge to transformerB
     * Note: Transformers A,B intersect if A.outputs has at least one attribute that matches B.inputs
     * @param {*} transformerA name of transformer
     * @param {*} transformerB name of transformer
     * @returns intersection object if they do intersect | false if they don't
     */
    transformersIntersect(transformerA, transformerB) {
        // store this intersection object so we don't have to get it twice, it could be costly
        if (this.graph.transformersIntersect(transformerA, transformerB)) {
            return this.graph.getIntersectionObject(transformerA, transformerB);
        }
        return false;
    }

    // Breadth first search but "success" means the outputs
    // of the current transformer matches the outputInstructions
    BFS(source, outputInstructions) {
        const plans = [];
        const visitedNodes = new Set();
        let counter = 0;
        // 0. form graph -> or form graph dynamically
        if (!this.graph) {
            this.formGraph();
        }
        // 1. For all transformers, create list of transformers whose input matches the source
        // plansQueue is an array of plans that functions like a queue (FIFO)
        // each plan is an array of strings: one or more transformers
        // ex: plansQueue = [['t1', 't2], ['t1', 't3']]
        const plansQueue = [];
        this.registeredTransformers.forEach(currentTransformerName => {
            const currentTransformer = this.registry[currentTransformerName];

            // check for match
            if (checkInputMatches(currentTransformer.inputs, source)) {
                // 2. Add input matches to queue
                // add to end of the array so it is in the back of the queue
                // each input match 
                plansQueue.push([currentTransformerName]);
            }
        });
        debug(`initial queue (inputs match the source): ${plansQueue}`);
        // edge case:
        // if there is no transformer that handles the input or the output,
        // no plan will be possible, no matter how far we traverse and recursively run
        if (plansQueue.length < 1) {
            debug('No plan found.');
            throw new RenditionFormatUnsupportedError(`No transformers match input format: ${source.type}`);
        }

        while (plansQueue.length > 0 && counter < MAX_STEP_COUNT) {
            // 3. Remove oldest item from the queue (FIFO)
            // remove first item from the array and shift items forward
            const currentPlan = plansQueue.shift();
            // 4. checkOutputMatches 
            // check if output of last transformer in the plan matches outputInstructions
            const lastTransformerName = currentPlan[currentPlan.length - 1];
            if (checkInputMatches(this.registry[lastTransformerName].outputs, outputInstructions)) {
                debug(`Plan found! ${currentPlan}`);
                plans.push(currentPlan);
            } else {
                if (visitedNodes.has(lastTransformerName)) {
                    debug(`Already visited this transformer: ${lastTransformerName}`);
                } else {
                    counter++;
                    visitedNodes.add(lastTransformerName);
                    // 5. If it doesn’t, traverse
                    // add each traversed plan to queue
                    debug(`Plan not found. Traversing adjacent nodes: ${lastTransformerName}`);
                    const adjacentTransformer = this.graph.adjacent(lastTransformerName);
                    adjacentTransformer.forEach(transformer => {
                        const newPlan = [...currentPlan, transformer];
                        plansQueue.push(newPlan);
                    });
                }
            }
        }
        if (plans.length > 1) {
            // TODO: choose the "best" path
            // for now, choose the shortest path
            // [[a,b], [a]] -> [a]
            debug(`multiple plans found, choosing shortest of the following plans ${plans}`);
            return plans.reduce((a, b) => a.length <= b.length ? a : b);
        }
        debug(`only one plan found: ${plans[0]}`);
        return plans[0];
    }
    /**
     * Given a plan with only the list of transformers, 
     * for the instructions (inputs/outputs) for each step in the plan
     * @param {Object} source contains metadata about the input (eg. mimetype, width, height, colorspace, ...) (required)
     * @param {Rendition} outputInstructions contains the instructions about the desired output (rendition) (required)
     * @param {Array} currentPlan ordered list of each transformer in the plan
     * @returns {Array} ordered array of steps to add to the plan:
                * @param {String} name transformer name
                * @param {Object} attributes custom attributes for this step
     */
    async formPlan(source, outputInstructions, currentPlan) {
        if (!currentPlan || currentPlan.length === 0) {
            debug(`No plan could be found for : ${source.type} -> ${outputInstructions.type}`);
            throw new RenditionFormatUnsupportedError(`No plan could be found for : ${source.type} -> ${outputInstructions.type}`);
        }

        // userData is an important field for sending IO events in Nui
        // for now, add them to every output step instructions
        // future plan: store these somewhere, maybe in the plan or engine level to put inside every event
        const userData = outputInstructions.userData;
        const plan = [];

        // first input is always source
        let input = clone(source);

        // get image metadata and check for "Orientation" property if the asset is going straight to sensei
        // this means the current plan only has one transformer and it is a sensei transformer
        if (currentPlan.length === 1 && currentPlan[0].includes("SenseiTransformer")) {
            // get image metadata and check for "Orientation" property
            const path = source.path? source.path : source.url;
            console.log('Checking orientation metadata for source file');
            const metadata = await getImageMetadata(path);
            // if image has Orientation metadata set image to sensei compliant orientation
            if (metadata && metadata.Orientation) {
                const orientationTransformer = this.registeredTransformers.filter(transformer => transformer.startsWith("workerCallback"))[0];
                if (orientationTransformer) {
                    const output = { type: source.type };
                    // add sourceType to input instructions
                    // sourceType is either "LOCAL" or "URL" signifying the type of source the transformer expects
                    const sourceType = this.registry[orientationTransformer].inputs.sourceType;
                    if (sourceType) {
                        input.sourceType = sourceType;
                    }
                    plan.push({name: orientationTransformer, attributes: { input, output}});

                    // deep copy
                    input = clone(output); // next `inputs` is exactly `outputs` of previous step
                }
            }
        }

        for (let i = 0; i < currentPlan.length; i++) {
            const transformer = currentPlan[i];
            const nextTransformer = currentPlan[i + 1];

            // add sourceType to input instructions
            const sourceType = this.registry[transformer].inputs.sourceType;
            if (sourceType) {
                input.sourceType = sourceType;
            }

            let output;
            // if its the last step, we know outputs === outputInstructions
            if (!nextTransformer) {
                output = outputInstructions;
            } else {
                const intersection = this.transformersIntersect(transformer, nextTransformer);
                // bestOfIntersection takes into account input to avoid upscaling
                output = bestOfIntersection(intersection, input);

                // adds userData to output object, which is needed for sending IO Events
                if (userData) {
                    output.userData = userData;
                }

                // Adds the width/height to the output object if they stay the same as the input (changed values were updated and set when changed)
                if (!output.width && input.width) {
                    output.width = input.width;
                }
                if (!output.height && input.height) {
                    output.height = input.height;
                }
            }
            plan.push({
                name: transformer,
                attributes: {
                    input: input,
                    output: output
                }
            });

            // deep copy
            input = clone(output); // next `inputs` is exactly `outputs` of previous step
            // userData is only needed in output fields
            delete input.userData;
        }
        console.log("~~~~~~ plan", JSON.stringify(plan, null, 2));
        return plan;
    }

    /**
    * Refines a plan
    * (To create a new plan: refines an empty plan)
    *
    * Validations:
    * - we don't validate there is no cycle, but we limit max. nodes we go through to 100 steps
    * @param {Object} source contains metadata about the input (eg. mimetype, width, height, colorspace, ...) (required)
    * @param {Rendition} outputInstructions contains the instructions about the desired output (rendition) (required)
    * @returns {Array} ordered array of steps to add to the plan:
    * @param {String} name transformer name
    * @param {Object} attributes custom attributes for this step
    ex:
        [ {
                name: transformer1,
                attributes: {
                    input: source
                    output: {
                        type: "image/png"
                    }
                }
            }, {
                name: transformer2,
                attributes: {
                input: {
                    type: "image/png"
                }
                output: outputInstructions
            }
        }]
     */
    async findBestPlan(source, outputInstructions) {
        if (!this.graph) {
            this.formGraph();
        }
        if (!source || source.type === undefined) {
            throw new SourceCorruptError("source.type is required but is not provided");
        }
        if (!this.isMimeType(source.type)) {
            throw new SourceCorruptError(`source.type (${source.type}) is not propertly formatted`);
        }
        if (!outputInstructions || outputInstructions.type === undefined) {
            throw new RenditionFormatUnsupportedError("outputInstructions.type is required but is not provided");
        }
        if (!this.isMimeType(outputInstructions.type)) {
            throw new RenditionFormatUnsupportedError(`outputInstructions.type (${outputInstructions.type}) is not propertly formatted`);
        }

        const plan = this.BFS(source, outputInstructions);
        return this.formPlan(source, outputInstructions, plan);
    }

    

    isMimeType(str) {
        return str !== undefined && (str + "").match("[A-Za-z0-9\\-+./]+");
    }
}

module.exports = PlanFinder;
