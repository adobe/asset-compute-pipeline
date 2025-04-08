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

/* eslint-env mocha */

'use strict';

// alternative debug configuration in VSCode
// in settings.json under mochaExplorer.env add these
//   "DEBUG": "pipeline:*",
//   "DEBUG_HIDE_DATE": "1",

process.env.DEBUG_HIDE_DATE = "1";

const debugConfig = require('debug');
debugConfig.enable("pipeline:*,test:*");
const debug = require('debug')('test:engine');
const nock = require('nock');
const proxyquire =  require('proxyquire');
const {Reason, GenericError, RenditionFormatUnsupportedError, RenditionTooLarge, SourceFormatUnsupportedError} = require('@adobe/asset-compute-commons');

const { TemporaryCloudStorage } = require('./storage/mock-temporary-cloud-storage');
const MockMetadata = require('./mock-metadata');
const Engine = require("../lib/engine");
const { Plan } = require("../lib/plan");
const Transformer = require("../lib/transformer");
const Manifest = require("../lib/manifest");
const assert = require('assert');

const path = require("path");
require('dotenv').config({ path: path.join(__dirname, 'test.env') });

function assertPlan(plan, string, obj) {
    assert.strictEqual(plan.toString(), string);
    assert.deepStrictEqual(plan.toObject(), obj);
}

// class CallbackTransformer extends Transformer {
//     constructor(name, manifest, computeFn) {
//         super(name, new Manifest(manifest));
//         this._computeFn = computeFn;
//     }

//     async compute(...args) {
//         return this._computeFn(...args);
//     }
// }

class GoodTransformer extends Transformer {

    get name() {
        return "goodTransformer";
    }

    get manifest() {
        return new Manifest({
            inputs: {
                type: ['image/tiff']
            },
            outputs: {
                type: ['image/gif', 'image/jpeg']
            }
        });
    }

    async compute(input, output) {
        debug('Running the TestTransformer!');
        assert.strictEqual(output.instructions.type, "image/gif");
        this.executionCount = this.executionCount ? this.executionCount += 1 : 1;
    }
}
class FailureTransformer extends Transformer {

    get name() {
        return "failureTransformer";
    }

    get manifest() {
        return new Manifest({
            inputs: {
                type: ['image/tiff', 'image/png']
            },
            outputs: {
                type: ['image/gif', 'image/tiff']
            }
        });
    }

    async compute() {
        debug('This transformer will fail!');
        throw new Error("Transformer Failure!");
    }
}
class BadTransformer extends Transformer {

    get name() {
        return "badTransformer";
    }

    get manifest() {
        return new Manifest({
            inputs: {
                type: ['image/png']
            },
            outputs: {
                type: ['image/gif']
            }
        });
    }

    async compute() {
        assert.fail("Not expected to be executed");
    }
}

const DEFAULT_ATTRIBUTES = Object.freeze({
    input: {
        type: 'image/png',
        path: './test/files/red_dot_alpha0.5.png'
    },
    output: {
        type: "image/png"
    }});


describe("Pipeline Engine tests", function () {
    before(function () {
        process.env.__OW_NAMESPACE = process.env.OW_NAMESPACE;
        process.env.__OW_API_KEY = process.env.OW_API_KEY;
        process.env.WORKER_BASE_DIRECTORY = 'build/work';
    });

    after(function(){
        delete process.env.__OW_NAMESPACE;
        delete process.env.__OW_API_KEY; 
        delete process.env.WORKER_BASE_DIRECTORY;
    });
    afterEach(() => {
        nock.cleanAll();
    });

    it("Runs a simple pipeline", function () {
        const pipeline = new Engine();
        const plan = new Plan();
        pipeline.run(plan);
    });

    it("Runs a pipeline with one transformer", async function () {
        const pipeline = new Engine();

        let transformerRan = false;
        class TestTransformer extends Transformer {
            async compute() {
                debug('Running the TestTransformer!');
                transformerRan = true;
            }
        }
        pipeline.registerTransformer(new TestTransformer('test'));

        const plan = new Plan();
        plan.add("test", DEFAULT_ATTRIBUTES);

        await pipeline.run(plan);
        assert.ok(transformerRan);
    });


    it("Runs a pipeline with one transformer with a manifest", async function () {
        const pipeline = new Engine();

        let transformerRan = false;
        const manifest = new Manifest({
            inputs: {
                type: ['image/png']
            },
            outputs: {
                type: ['image/jpeg']
            }
        });
        class TestTransformer extends Transformer {
            async compute() {
                debug('Running the TestTransformer!');
                transformerRan = true;
            }
            async prepare() {
                debug("Preparing transformer!");
            }
        }
        pipeline.registerTransformer(new TestTransformer('test', manifest));

        const plan = new Plan();
        plan.add("test", DEFAULT_ATTRIBUTES);

        await pipeline.run(plan);
        assert.ok(transformerRan);
    });

    it("Runs a pipeline with two transformers", async function () {
        const pipeline = new Engine();

        // creating a registry in the engine
        // (engine needs to know transformers)
        let runCounts = 0;
        class TestTransformer extends Transformer {
            async compute(input, output) {
                ++runCounts;
                debug("Running the TestTransformer!");
                // TODO: test failing when run with other tests
                output.path = input.path;
                return output;
            }
        }
        pipeline.registerTransformer(new TestTransformer("test1"));
        pipeline.registerTransformer(new TestTransformer("test2"));

        // execution: plan creation & running
        const plan = new Plan();
        const attributes = {
            input: {
                type: 'image/png',
                path: './test/files/red_dot_alpha0.5.png'
            },
            output: {
                type: "image/png"
            }};
        plan.add("test1", attributes);
        plan.add("test2", attributes);

        await pipeline.run(plan);
        assert.strictEqual(runCounts, 2);
    });

    it("Runs a pipeline with two transformers, and additional params", async function () {
        const params = {
            auth: {
                apiKey: "hello",
                token: "world"
            }
        };

        const pipeline = new Engine(params);

        // creating a registry in the engine
        // (engine needs to know transformers)
        let runCounts = 0;
        class TestTransformer extends Transformer {
            async compute(input, output) {
                ++runCounts;
                debug("Running the TestTransformer!");
                // TODO: test failing when run with other tests
                output.path = input.path;

                // make sure auth passes along in all transformers
                assert.deepStrictEqual(input.auth.apiKey, "hello");
                assert.deepStrictEqual(input.auth.token, "world");

                return output;
            }
        }
        pipeline.registerTransformer(new TestTransformer("test1"));
        pipeline.registerTransformer(new TestTransformer("test2"));

        // execution: plan creation & running
        const plan = new Plan();
        const attributes = {
            input: {
                type: 'image/png',
                path: './test/files/red_dot_alpha0.5.png'
            },
            output: {
                type: "image/png"
            }};
        plan.add("test1", attributes);
        plan.add("test2", attributes);

        await pipeline.run(plan);
        assert.strictEqual(runCounts, 2);
    });

    it("Passes firefall auth parameters correctly to transformer", async function () {
        const params = {
            auth: {
                apiKey: "test-key",
                token: "test-token"
            },
            firefallClientId: "test-client-id",
            firefallClientSecret: "test-client-secret",
            firefallAuthCode: "test-auth-code",
            firefallTier: "test-tier"
        };

        const pipeline = new Engine(params);

        let authVerified = false;
        class TestTransformer extends Transformer {
            async compute(input) {
                // verify auth params
                assert.strictEqual(input.auth.apiKey, "test-key");
                assert.strictEqual(input.auth.token, "test-token");
                
                // verify firefall params
                assert.strictEqual(input.auth.firefall.firefallClientId, "test-client-id");
                assert.strictEqual(input.auth.firefall.firefallClientSecret, "test-client-secret");
                assert.strictEqual(input.auth.firefall.firefallAuthCode, "test-auth-code");
                assert.strictEqual(input.auth.firefall.firefallTier, "test-tier");
                
                authVerified = true;
            }
        }
        
        pipeline.registerTransformer(new TestTransformer("test"));

        const plan = new Plan();
        plan.add("test", DEFAULT_ATTRIBUTES);

        await pipeline.run(plan);
        assert.ok(authVerified, "Auth parameters verification was not executed");
    });

    it("Last added transformer wins when names are duplicated", async function () {
        const pipeline = new Engine();

        // creating a registry in the engine
        // (engine needs to know transformers)
        class TestTransformer extends Transformer {
            async compute() {
                debug("Running the TestTransformer!");
            }
            async prepare() {
                debug("Preparing transformer!");
            }
        }

        let transformerRan = false;
        class TestTransformer2 extends Transformer {
            async compute() {
                debug("Running the TestTransformer!");
                transformerRan = true;
            }
            async prepare() {
                debug("Preparing transformer!");
            }
        }
        pipeline.registerTransformer(new TestTransformer("test"));
        pipeline.registerTransformer(new TestTransformer2("test"));

        // execution: plan creation & running
        const plan = new Plan();
        plan.add("test", DEFAULT_ATTRIBUTES);

        await pipeline.run(plan);
        assert.ok(transformerRan);
    });

    it("Runs a pipeline with one transformer and one refines the plan", async function () {
        const pipeline = new Engine();

        const goodTransformer = new GoodTransformer();
        pipeline.registerTransformer(goodTransformer);
        pipeline.registerTransformer(new BadTransformer());

        const input = {
            type: 'image/tiff',
            path: './test/files/red_dot_alpha0.5.png'
        };
        const output = {
            type: 'image/gif'
        };

        const plan = new Plan();
        // TODO: should happen inside transformer
        await pipeline.refinePlan(plan, input, output);
        assertPlan(plan, "[start] -> { goodTransformer* }", [{
            name: "goodTransformer",
            output: output,
            input: input
        }]);

        await pipeline.run(plan);
        assert.strictEqual(goodTransformer.executionCount, 1);
    });
    it("Runs a pipeline and a transformer fails", async function () {
        const pipeline = new Engine();
        pipeline.registerTransformer(new FailureTransformer());

        const input = {
            type: 'image/tiff',
            path: './test/files/red_dot_alpha0.5.png'
        };
        const output = {
            type: 'image/gif'
        };

        const plan = new Plan();
        await pipeline.refinePlan(plan, input, output);

        const result = await pipeline.run(plan);
        assert.ok(result.renditionErrors);
        assert.strictEqual(result.renditionErrors[0].message,  "Transformer failureTransformer failed: Transformer Failure!");
    });
    it("Runs a pipeline and a transformer fails before plan is finished", async function () {
        const pipeline = new Engine();
        class TestTransformer extends Transformer {
            async compute(input, output) {
                debug("Running the TestTransformer!");
                output.path = input.path;
                return output;
            }
        }
        pipeline.registerTransformer(new TestTransformer("test1"));
        pipeline.registerTransformer(new FailureTransformer());

        // execution: plan creation & running
        const plan = new Plan();
        const attributes = {
            input: {
                type: 'image/png',
                path: './test/files/red_dot_alpha0.5.png',
                name: 'red_dot_alpha0.5.png'
            },
            output: {
                type: "image/png"
            }};
        plan.add("failureTransformer", attributes);
        plan.add("test1", attributes);

        await pipeline.run(plan);

        const result = await pipeline.run(plan);
        assert.ok(result.renditionErrors);
        assert.strictEqual(result.renditionErrors[0].message,  "Transformer failureTransformer failed: Transformer Failure!");
    });
    it("Runs a pipeline, a transformer fails and userData is in io event", async function () {
        const pipeline = new Engine({ skipMetadataExtraction: true });
        pipeline.registerTransformer(new GoodTransformer());
        pipeline.registerTransformer(new FailureTransformer());

        // execution: plan creation & running
        const plan = new Plan();
        const input = {
            type: 'image/png',
            path: './test/files/red_dot_alpha0.5.png'
        };
        const output = {
            type: "image/jpeg",
            userData: {
                assetPath: '12344'
            }
        };

        await pipeline.refinePlan(plan, input, output);
        // userData gets added to output of each step so its inside in the io events if the plan fails midway through
        assertPlan(plan, '[start] -> { failureTransformer -> goodTransformer* }', [
            {
                name: 'failureTransformer',
                input: {
                    type: 'image/png',
                    path: './test/files/red_dot_alpha0.5.png'
                },
                output: { 
                    type: 'image/tiff',
                    userData: {
                        assetPath: '12344'
                    } 
                }
            },
            {
                name: 'goodTransformer',
                input: { type: 'image/tiff' },
                output: { 
                    type: 'image/jpeg',
                    userData: {
                        assetPath: '12344'
                    } 
                }
            }
        ]);
        const result = await pipeline.run(plan);
        assert.ok(result.renditionErrors);
        assert.strictEqual(result.renditionErrors[0].message,  "Transformer failureTransformer failed: Transformer Failure!");
    });


    it("Runs a pipeline where download fails", async function () {
        const pipeline = new Engine();

        const step = Object.freeze({
            input: {
                type: 'image/png'
            },
            output: {
                type: "image/png"
            }
        });
        class TestTransformer extends Transformer {
            async compute() {
            }
        }
        pipeline.registerTransformer(new TestTransformer('test'));

        const plan = new Plan();
        plan.add("test", step);

        const result = await pipeline.run(plan);
        assert.ok(result.renditionErrors);
        assert.strictEqual(result.renditionErrors[0].message, "No source file accessible.");
    });

    it("Runs a pipeline where transformer throws RenditionFormatUnsupportedError (pass through)", async function () {
        const pipeline = new Engine();
        class TestTransformer extends Transformer {
            async compute() {
                debug('Running the TestTransformer!');
                throw new RenditionFormatUnsupportedError("error passed through");
            }
        }
        pipeline.registerTransformer(new TestTransformer('test'));

        const plan = new Plan();
        plan.add("test", DEFAULT_ATTRIBUTES);

        const result = await pipeline.run(plan);
        assert.ok(result.renditionErrors);
        assert.strictEqual(result.renditionErrors[0].message, "error passed through");
        assert.strictEqual(result.renditionErrors[0].reason, Reason.RenditionFormatUnsupported);
    });
    it("Runs a pipeline where transformer throws RenditionTooLarge (pass through)", async function () {
        const pipeline = new Engine();
        class TestTransformer extends Transformer {
            async compute() {
                debug('Running the TestTransformer!');
                throw new RenditionTooLarge("error passed through");
            }
        }
        pipeline.registerTransformer(new TestTransformer('test'));

        const plan = new Plan();
        plan.add("test", DEFAULT_ATTRIBUTES);

        const result = await pipeline.run(plan);
        assert.ok(result.renditionErrors);
        assert.strictEqual(result.renditionErrors[0].message, "error passed through");
        assert.strictEqual(result.renditionErrors[0].reason, Reason.RenditionTooLarge);
    });
    it("Runs a pipeline where transformer throws SourceFormatUnsupportedError (pass through)", async function () {
        const pipeline = new Engine();
        class TestTransformer extends Transformer {
            async compute() {
                debug('Running the TestTransformer!');
                throw new SourceFormatUnsupportedError("error passed through");
            }
        }
        pipeline.registerTransformer(new TestTransformer('test'));

        const plan = new Plan();
        plan.add("test", DEFAULT_ATTRIBUTES);

        const result = await pipeline.run(plan);
        assert.ok(result.renditionErrors);
        assert.strictEqual(result.renditionErrors[0].message, "error passed through");
        assert.strictEqual(result.renditionErrors[0].reason, Reason.SourceFormatUnsupported);
    });
    it("Runs a pipeline where transformer throws an unknown error (wrap in GenericError", async function () {
        const pipeline = new Engine();
        class TestTransformer extends Transformer {
            async compute() {
                debug('Running the TestTransformer!');
                throw new Error("custom error");
            }
        }
        pipeline.registerTransformer(new TestTransformer('test'));

        const plan = new Plan();
        plan.add("test", DEFAULT_ATTRIBUTES);

        const result = await pipeline.run(plan);
        assert.ok(result.renditionErrors);
        assert.strictEqual(result.renditionErrors[0].message, "Transformer test failed: custom error");
        assert.strictEqual(result.renditionErrors[0].name, GenericError.name);
    });

    it("Check original source file is passed to transformer", async function () {
        const pipeline = new Engine();

        const originalInput = {
            type: 'image/tiff',
            path: './test/files/red_dot_alpha0.5.png'
        };
        const output = {
            type: 'image/gif'
        };
        class TestTransformer extends GoodTransformer {
            async compute(input, output, transformerContext) {
                debug('Running the TestTransformer!');
                assert.deepStrictEqual(transformerContext.originalInput, originalInput,
                    "transformerContext.source is different from originalInput");
                output.path = input.path;
                return output;
            }
        }

        const testTransformer = new TestTransformer();
        pipeline.registerTransformer(testTransformer);

        const plan = new Plan();
        // TODO: should happen inside transformer
        await pipeline.refinePlan(plan, originalInput, output);
        const result = await pipeline.run(plan);
        assert.ok(!result.renditionErrors, `Unexepected error: ${result.renditionErrors}`);
    });

    it("Should generate a presigned url when sourceType is 'URL' with input datauri", async function () {
        // when no overrides are specified, path.extname behaves normally

        // datauri file is called in multiple places: engine.js and storage/index.js
        // for this test, it is called in Storage, so we must mock it inside that file
        const datauri = proxyquire('../lib/storage/datauri', {
            './temporary-cloud-storage.js':  {TemporaryCloudStorage}
        });
        const { Storage } = proxyquire('../lib/storage', {
            './datauri': datauri
        });
        const Engine = proxyquire('../lib/engine', 
            {
                './storage': {
                    Storage
                }
            });
        const pipeline = new Engine();
        let transformerRan = false;
        let preparedInputAsset;
        class TestTransformer extends Transformer {
            async compute(input) {
                debug('Running the TestTransformer!');
                transformerRan = true;
                preparedInputAsset = input;
            }
        }
        pipeline.registerTransformer(new TestTransformer('test'));

        const plan = new Plan();
        plan.add("test", {
            input: {
                type: 'image/png',
                url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQYV2NgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=',
                sourceType: 'URL'
            },
            output: {
                type: "image/jpeg"
            }
        });

        await pipeline.run(plan);
        assert.ok(transformerRan);
        assert.ok(preparedInputAsset.url.includes('preSignUrl'));
    });

    it("Should generate a presigned url when sourceType is 'URL' without input url", async function () {
        // datauri file is called in multiple places: engine.js and storage/index.js
        // for this test, it is called in engine.js directly, so we must mock it there instead of Storage
        const datauri = proxyquire('../lib/storage/datauri', {
            './temporary-cloud-storage.js':  {TemporaryCloudStorage}
        });
        const Engine = proxyquire('../lib/engine', 
            {
                './storage/datauri': datauri
            });

        const pipeline = new Engine();

        let transformerRan = false;
        let preparedInputAsset;
        class TestTransformer extends Transformer {
            async compute(input) {
                debug('Running the TestTransformer!');
                transformerRan = true;
                preparedInputAsset = input;
            }
        }
        pipeline.registerTransformer(new TestTransformer('test'));

        const plan = new Plan();
        plan.add("test", {
            input: {
                type: 'image/png',
                path: 'fakeSuccessFilePath',
                sourceType: 'URL'
            },
            output: {
                type: "image/png"
            }
        });

        await pipeline.run(plan);
        assert.ok(transformerRan);
        assert.deepStrictEqual(preparedInputAsset.url, 'http://storage.com/preSignUrl/fakeSuccessFilePath');
    });

    it("Should download when sourceType is 'LOCAL' with input datauri", async function () {
        let downloadRan = false;

        // datauri file is called in multiple places: engine.js and storage/index.js
        // for this test, it is called via Storage so we much mock it inside storage/index.js
        const { Storage } = proxyquire('../lib/storage', {
            './datauri': {
                download : () => { downloadRan = true; }
            }
        });
        const Engine = proxyquire('../lib/engine', 
            {
                './storage': {
                    Storage
                }
            });

        const pipeline = new Engine();
        pipeline.registerTransformer(new Transformer('test'));

        const plan = new Plan();
        plan.add("test", {
            input: {
                type: 'image/png',
                url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQYV2NgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=',
                sourceType: 'LOCAL'
            },
            output: {
                type: "image/png"
            }
        });

        await pipeline.run(plan);
        assert.ok(downloadRan);
    });

    it("Should download when sourceType is 'LOCAL' with input url", async function () {
        let downloadRan = false;
        let transformerRan = false;

        const { Storage } = proxyquire('../lib/storage', {
            './http': {
                download : () => { 
                    downloadRan = true;
                    console.log(`Fake download success`);
                }
            }
        });
        const Engine = proxyquire('../lib/engine', 
            {
                './storage': {
                    Storage
                }
            });
        const pipeline = new Engine();

        class TestTransformer extends Transformer {
            async compute() {
                debug('Running the TestTransformer!');
                transformerRan = true;
            }
        }
        pipeline.registerTransformer(new TestTransformer('test'));

        const plan = new Plan();
        plan.add("test", {
            input: {
                type: 'image/png',
                url: 'https://example.com/fakeEarth.jpg',
                sourceType: 'LOCAL'
            },
            output: {
                type: "image/png"
            }
        });

        await pipeline.run(plan);
        assert.ok(transformerRan);
        assert.ok(downloadRan);
    });

    it("Should error when neither input url nor path are provided", async function () {
        const pipeline = new Engine();
        pipeline.registerTransformer(new Transformer('test'));

        const plan = new Plan();
        plan.add("test", {
            input: {
                type: 'image/png',
                sourceType: 'LOCAL'
            },
            output: {
                type: "image/png"
            }
        });

        const result = await pipeline.run(plan);
        assert.ok(result.renditionErrors);
        assert.strictEqual(result.renditionErrors[0].message,  "No source file accessible.");
    });

    it("Should default to LOCAL when no sourceType provided", async function () {
        let downloadRan = false;
        let transformerRan = false;
        const { Storage } = proxyquire('../lib/storage', {
            './http': {
                download : () => { downloadRan = true; }
            }
        });
        const Engine = proxyquire('../lib/engine', 
            {
                './storage': {
                    Storage
                }
            });
        const pipeline = new Engine();

        class TestTransformer extends Transformer {
            async compute() {
                debug('Running the TestTransformer!');
                transformerRan = true;
            }
        }
        pipeline.registerTransformer(new TestTransformer('test'));

        const plan = new Plan();
        plan.add("test", {
            input: {
                type: 'image/png',
                url: 'https://example.com/fakeEarth.jpg'
            },
            output: {
                type: "image/png"
            }
        });

        await pipeline.run(plan);
        assert.ok(transformerRan);
        assert.ok(downloadRan);
    });

    it("Should error when invalid path is provided", async function () {
        // datauri file is called in multiple places: engine.js and storage/index.js
        // for this test, it is called in engine.js directly, so we must mock it there instead of Storage
        const datauri = proxyquire('../lib/storage/datauri', {
            './temporary-cloud-storage.js':  {TemporaryCloudStorage}
        });
        const Engine = proxyquire('../lib/engine', 
            {
                './storage/datauri': datauri
            });

        const pipeline = new Engine();
        pipeline.registerTransformer(new Transformer('test'));

        const plan = new Plan();
        plan.add("test", {
            input: {
                type: 'image/png',
                path: 'fakeInvalidFilePath',
                sourceType: 'URL'
            },
            output: {
                type: "image/png"
            }
        });

        const result = await pipeline.run(plan);
        assert.ok(result.renditionErrors);
        assert.strictEqual(result.renditionErrors[0].message,  "Fail generating presigned url.");
    });

    it("Should error when invalid url is provided", async function () {
        const pipeline = new Engine();
        pipeline.registerTransformer(new Transformer('test'));

        const plan = new Plan();
        plan.add("test", {
            input: {
                type: 'image/png',
                url: 'https://notvalid<',
                sourceType: 'URL'
            },
            output: {
                type: "image/png"
            }
        });

        const result = await pipeline.run(plan);
        assert.ok(result.renditionErrors);
        assert.strictEqual(result.renditionErrors[0].message,  "https://notvalid< must be a valid https url or datauri");
    });

    it("Should error when invalid datauri is provided", async function () {
        const pipeline = new Engine();
        pipeline.registerTransformer(new Transformer('test'));

        const plan = new Plan();
        plan.add("test", {
            input: {
                type: 'image/png',
                url: 'data:image/a/c;base64,xxx',
                sourceType: 'URL'
            },
            output: {
                type: "image/png"
            }
        });

        const result = await pipeline.run(plan);
        assert.ok(result.renditionErrors);
        assert.strictEqual(result.renditionErrors[0].message,  "data:image/a/c;base64,xxx must be a valid https url or datauri");
    });

    it("Should try to download before refinePlan with input url no source name nor path", async function () {
        const Engine = proxyquire('../lib/engine', 
            {
                './metadata': MockMetadata
            });

        nock('https://example.com')
            .get('/fakeEarth.tiff')
            .reply(200, "ok", {
                'content-type': 'image/tiff',
                'content-length': 2
            });
        
        const pipeline = new Engine();
        
        const goodTransformer = new GoodTransformer();
        pipeline.registerTransformer(goodTransformer);
        pipeline.registerTransformer(new BadTransformer());
        
        const input = {
            type: 'image/tiff',
            size: 2,
            url: 'https://example.com/fakeEarth.tiff'
        };
        const output = {
            type: 'image/gif'
        };
        
        const plan = new Plan();
        // TODO: should happen inside transformer
        await pipeline.refinePlan(plan, input, output);
        assertPlan(plan, "[start] -> { goodTransformer* }", [{
            name: "goodTransformer",
            output: output,
            input: input
        }]);
        // assert download ran
        assert(nock.isDone());
        await pipeline.run(plan);
    });

    it("Should download before refinePlan with input url (refinePlan)", async function () {
        const Engine = proxyquire('../lib/engine', 
            {
                './metadata': MockMetadata
            });

        nock('https://example.com')
            .get('/fakeEarth.tiff')
            .reply(200, "ok", {
                'content-type': 'image/tiff',
                'content-length': 2
            });

        const pipeline = new Engine();

        const goodTransformer = new GoodTransformer();
        pipeline.registerTransformer(goodTransformer);
        pipeline.registerTransformer(new BadTransformer());

        const input = {
            type: 'image/tiff',
            size: 2,
            url: 'https://example.com/fakeEarth.tiff',
            name: "fakeEarth.tiff"
        };
        const output = {
            type: 'image/gif'
        };

        const plan = new Plan();
        // TODO: should happen inside transformer
        await pipeline.refinePlan(plan, input, output);
        assertPlan(plan, "[start] -> { goodTransformer* }", [{
            name: "goodTransformer",
            output: output,
            input: input
        }]);
        // assert download ran
        assert(nock.isDone());
        await pipeline.run(plan);
    });

    it("Pipeline fails with SourceCorruptError in metadata check because file contains zeros", async function () {
        const params = {
            auth: {
                apiKey: "hello",
                token: "world"
            }
        };

        const pipeline = new Engine(params);

        // execution: plan creation & running
        const plan = new Plan();
        const input = {
            type: 'image/png',
            path: './test/files/broken.jpg'
        };
        const output = {
            type: "image/png"
        };
        await pipeline.refinePlan(plan, input, output);

        const result = await pipeline.run(plan);
        assert.ok(result.renditionErrors);
        assert.strictEqual(result.renditionErrors[0].reason, 'SourceCorrupt');
        assert.ok(result.renditionErrors[0].message.includes('binary zeros'));
    });
    it("Pipeline fails with SourceCorruptError in metadata check due to file format error", async function () {
        const params = {
            auth: {
                apiKey: "hello",
                token: "world"
            }
        };

        const pipeline = new Engine(params);

        // execution: plan creation & running
        const plan = new Plan();
        const input = {
            type: 'image/png',
            path: './test/files/broken.psd'
        };
        const output = {
            type: "image/png"
        };
        await pipeline.refinePlan(plan, input, output);

        const result = await pipeline.run(plan);
        assert.ok(result.renditionErrors);
        assert.strictEqual(result.renditionErrors[0].reason, 'SourceCorrupt');
        assert.ok(result.renditionErrors[0].message.includes('improper image header'));
    });
});