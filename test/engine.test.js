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

    it.only("Runs a pipeline with one transformer with a manifest", async function () {
        this.timeout(10000); 
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
        plan.add("test", {
            input: {
                type: 'image/png',
                path: './test/files/red_dot_alpha0.5.png',
                sourceType: 'URL'
            },
            output: {
                type: "image/png"
            }
        });

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
                path: './test/files/red_dot_alpha0.5.png'
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
        const pipeline = new Engine();
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
                input: { type: 'image/png', path: './test/files/red_dot_alpha0.5.png' },
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
});