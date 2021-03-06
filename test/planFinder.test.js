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

/* eslint-env mocha */

'use strict';

// alternative debug configuration in VSCode
// in settings.json under mochaExplorer.env add these
//   "DEBUG": "pipeline:*",
//   "DEBUG_HIDE_DATE": "1",

process.env.DEBUG_HIDE_DATE = "1";

const debugConfig = require('debug');
debugConfig.enable("pipeline:*,test:*");
//const debug = require('debug')('test:engine');

const Engine = require("../lib/engine");
const {Plan} = require("../lib/plan");
const PlanFinder = require("../lib/plan-finder");
const Transformer = require("../lib/transformer");
const assert = require('assert');
const { TransformerGIF, TransformerPNG, TransformerSensei, TransformerImage } = require('./transformers/testTransformers');
const {RenditionFormatUnsupportedError, SourceCorruptError} = require('@adobe/asset-compute-commons');

function assertPlan(plan, string, obj) {
    assert.strictEqual(plan.toString(), string);
    assert.deepStrictEqual(plan.toObject(), obj);
}

// Simplify transformers to have input/output be numbers instead of objects
describe("PlanFinder simplified transformer tests", function() {
    it("Sanitizes its inputs", function() {
        const planFinder = new PlanFinder({});
        assert.throws(()=>planFinder.findBestPlan(), SourceCorruptError, "No input or outputInstructions should throw an error");
        assert.throws(()=>planFinder.findBestPlan({},{}), SourceCorruptError, "No input or outputInstructions types should throw an error");
        assert.throws(()=>planFinder.findBestPlan({type:0},{}), RenditionFormatUnsupportedError, "No outputInstructions type should throw an error");
        assert.throws(()=>planFinder.findBestPlan({},{type:0}), SourceCorruptError, "No input type should throw an error");
        assert.throws(()=>planFinder.findBestPlan({type:0},{type:'not a mime type!'}), RenditionFormatUnsupportedError, "Mime types shouldn't have spaces");
        assert.throws(()=>planFinder.findBestPlan({type:0},{type:0}), RenditionFormatUnsupportedError, "Types are valid but fails to create plan for other reasons");
        // Simple tests of known valid mime types
        assert.ok(planFinder.isMimeType("image/gif"));
        assert.ok(planFinder.isMimeType("video/x-msvideo"));
        assert.ok(planFinder.isMimeType("application/xml+encoded+mess"));
    });  

    it("Simplified transformers for tests", async function() {
        const T1 = new Transformer("T1", { inputs: {type:1}, outputs: {type:2} });
        const T2 = new Transformer("T2", { inputs: {type:2}, outputs: {type:3} });
        const T3 = new Transformer("T3", { inputs: {type:3}, outputs: {type:4} });
        const T4 = new Transformer("T4", { inputs: {type:2}, outputs: {type:3} });
        const registry = {T1, T2, T3, T4};

        const planFinder = new PlanFinder(registry);

        let steps = planFinder.findBestPlan({type:1},{type:2});
        assert.deepStrictEqual(steps, [{
            name: "T1",
            attributes: { 
                input: {
                    type: 1
                },
                output: {
                    type: 2
                }
            }
        }]);

        steps = planFinder.findBestPlan({type:1},{type:3});
        assert.deepStrictEqual(steps, [{
            name: "T1",
            attributes: { 
                input: {
                    type: 1
                },
                output: {
                    type: 2
                }
            }
        }, {
            name: "T2",
            attributes: { 
                input: {
                    type:2
                },
                output: {
                    type: 3
                }
            }
        }]);

        steps = planFinder.findBestPlan({type:1},{type:4});
        assert.deepStrictEqual(steps, [{
            name: "T1",
            attributes: { 
                input: {
                    type: 1
                },
                output: {
                    type: 2
                }
            }
        }, {
            name: "T2",
            attributes: { 
                input: {
                    type:2
                },
                output: {
                    type: 3
                }
            }
        }, {
            name: "T3",
            attributes: { 
                input: {
                    type: 3
                },
                output: {
                    type: 4
                }
            }
        }]);
    });

    it("Simplified transformers for tests - with repeats", async function() {
        // Registered transformers would result in the following graphs:
        // T1 -> T2
        // T3
        const T1 = new Transformer("T1", { inputs: {type: 1}, outputs: {type: 2} });
        const T2 = new Transformer("T2", { inputs: {type: 2}, outputs: {type: 3} });
        const T3 = new Transformer("T3", { inputs: {type: 1}, outputs: {type: 1} });
        // checks it does not break into a forever loop
        const registry = {T1, T2, T3};
        const planFinder = new PlanFinder(registry);

        const steps = planFinder.findBestPlan({type:1},{type:3});
        assert.deepStrictEqual(steps, [{
            name: "T1",
            attributes: { 
                input: {
                    type:1
                },
                output: {
                    type:2
                }
            }
        }, {
            name: "T2",
            attributes: { 
                input: {
                    type: 2
                },
                output: {
                    type: 3
                }
            }
        }]);
    });
    it("No plan found - no input", async function() {
        const T1 = new Transformer("T1", { inputs: {type: 1}, outputs: {type:2 } });
        const T2 = new Transformer("T2", { inputs: {type: 2}, outputs: {type:3 } });
        const registry = {T1, T2};
        const planFinder = new PlanFinder(registry);

        assert.throws(()=> {
            planFinder.findBestPlan({type:3},{type:2});
        }, RenditionFormatUnsupportedError, "Should throw error when plan cannot be found");
    });
    it("No plan found - no output", async function() {
        // Registered transformers would result in the following graphs:
        // T1 -> T2
        // Asking for a transformer that doesn't exist
        const T1 = new Transformer("T1", { inputs: {type:1}, outputs: {type:2} });
        const T2 = new Transformer("T2", { inputs: {type:2}, outputs: {type:3} });
        const registry = {T1, T2};

        assert.throws(()=>{
            new PlanFinder(registry).findBestPlan({type:1}, {type:4});
        }, RenditionFormatUnsupportedError, "Should throw error when plan cannot be found");        
    });
    it("No plan found - input & output possible but graphs don't connect", async function() {
        // Registered transformers would result in the following graphs:
        // T1 -> T2
        // T3
        // So asking for T1 -> T3 is not possible, because the graphs don't connect
        const T1 = new Transformer("T1", { inputs: {type:1}, outputs: {type:2} });
        const T2 = new Transformer("T2", { inputs: {type:2}, outputs: {type:3} });
        const T3 = new Transformer("T3", { inputs: {type:5}, outputs: {type:4} });
        const registry = {T1, T2, T3};

        assert.throws(()=>{
            new PlanFinder(registry).findBestPlan({type:1}, {type:4});
        }, RenditionFormatUnsupportedError, "Should throw error when plan cannot be found");        
    });
    it("No plan found - input & output possible but not path (nested)", async function() {
        // Registered transformers would result in 3 separate graphs:
        // T1 -> T2
        // T3
        // T4
        // So asking for T1 -> T3 is not possible, because the graphs don't connect
        const T1 = new Transformer("T1", { inputs: {type:1}, outputs: {type:2} });
        const T2 = new Transformer("T2", { inputs: {type:2}, outputs: {type:3} });
        const T3 = new Transformer("T3", { inputs: {type:1}, outputs: {type:3} });
        const T4 = new Transformer("T4", { inputs: {type:5}, outputs: {type:4} });
        const registry = {T1, T2, T3, T4};
        assert.throws(()=>{
            new PlanFinder(registry).findBestPlan({type:1}, {type:4});
        }, RenditionFormatUnsupportedError, "Should throw error when plan cannot be found");        
    });
    it("Shorter plan chosen", async function() {
        // there are techinically two possible plans:
        // [T1, T4] and [T1, T2, T3, T4]
        // algorithm will choose [T1, T4] before even determining the other plan is an option
        // Graph looks like this:
        // T1 --> T2 <--> T3
        //  |             |
        //  |             v
        //  ------------> T4
        const T1 = new Transformer("T1", { inputs: {type:1}, outputs: {type:2} });
        const T2 = new Transformer("T2", { inputs: {type:2}, outputs: {type:3} });
        const T3 = new Transformer("T3", { inputs: {type:3}, outputs: {type:2} });
        const T4 = new Transformer("T4", { inputs: {type:2}, outputs: {type:4} });
        const registry = {T1, T2, T3, T4};
        const planFinder = new PlanFinder(registry);

        const steps = planFinder.findBestPlan({type:1},{type:4});
        assert.deepStrictEqual(steps, [{
            name: "T1",
            attributes: { 
                input: {
                    type: 1
                },
                output: {
                    type: 2
                }
            }
        }, {
            name: "T4",
            attributes: { 
                input: {
                    type: 2
                },
                output: {
                    type: 4
                }
            }
        }]);
    });
    it("Complicated graph (BFS)", async function() {
        // T1 -> T7
        // Simplified Graph looks like this:
        // Ours is ordered however, but for simplicity i removed the arrows
        //        T1
        //      /    |  
        //     T2    T3 
        //    /  \   |     
        //   T4  T6  T7  
        // taken from google: https://i.stack.imgur.com/t5En1.png
        // Plan: [ T1, T3, T7]
        const T1 = new Transformer("T1", { inputs: { type: 1 }, outputs: { type: 2 } });
        const T2 = new Transformer("T2", { inputs: { type: 2 }, outputs: { type: 3 } });
        const T3 = new Transformer("T3", { inputs: { type: 2 }, outputs: { type: 4 } });
        const T4 = new Transformer("T4", { inputs: { type: 3 }, outputs: { type: 10 } });
        const T6 = new Transformer("T6", { inputs: { type: 3 }, outputs: { type: 5 } });
        const T7 = new Transformer("T7", { inputs: { type: 4 }, outputs: { type: 6 } });
        const registry = {T1, T2, T3, T4, T6, T7};
        const planFinder = new PlanFinder(registry);

        const steps = planFinder.findBestPlan({type:1},{type:6});
        assert.deepStrictEqual(steps, [{
            name: "T1",
            attributes: { 
                input: {
                    type: 1
                },
                output: {
                    type: 2
                }
            }
        }, {
            name: "T3",
            attributes: { 
                input: {
                    type: 2
                },
                output: {
                    type: 4
                }
            }
        }, {
            name: "T7",
            attributes: { 
                input: {
                    type: 4
                },
                output: {
                    type: 6
                }
            }
        }]); // note that last node is missing from list due to where i add nodes
    });
    it("More complicated graph (BFS)", async function() {
        // T1 -> T7
        // Simplified Graph looks like this:
        // Ours is ordered however, but for simplicity i removed the arrows
        //           T1
        //      /    |    \
        //     T2    T3   T5
        //    /  \   |     |
        //   T4  T6  T7    |
        //        |        |
        //        ----------
        // Plan: [ T1, T3, T7]
        const T1 = new Transformer("T1", { inputs: { type: 1 }, outputs: { type: 2 } });
        const T2 = new Transformer("T2", { inputs: { type: 2 }, outputs: { type: 3 } });
        const T3 = new Transformer("T3", { inputs: { type: 2 }, outputs: { type: 4 } });
        const T4 = new Transformer("T4", { inputs: { type: 3 }, outputs: { type: 10 } });
        const T5 = new Transformer("T5", { inputs: { type: 5 }, outputs: { type: 1 } });
        const T6 = new Transformer("T6", { inputs: { type: 3 }, outputs: { type: 5 } });
        const T7 = new Transformer("T7", { inputs: { type: 4 }, outputs: { type: 6 } });
        const registry = {T1, T2, T3, T4, T5, T6, T7};
        const planFinder = new PlanFinder(registry);

        const steps = planFinder.findBestPlan({type:1},{type:6});
        assert.deepStrictEqual(steps, [{
            name: "T1",
            attributes: { 
                input: {
                    type: 1
                },
                output: {
                    type: 2
                }
            }
        }, {
            name: "T3",
            attributes: { 
                input: {
                    type: 2
                },
                output: {
                    type: 4
                }
            }
        }, {
            name: "T7",
            attributes: { 
                input: {
                    type: 4
                },
                output: {
                    type: 6
                }
            }
        }]); // note that last node is missing from list due to where i add nodes
    });
    it("Simplified transformers for tests - 100 nodes", async function() {
        // checks it does not break into a forever loop
        const registry = {};

        for (let i=0; i<100; i++) {
            const tName = `T${i}`;
            registry[tName] = new Transformer(tName, { inputs: {type:i}, outputs: {type:i+1} });
        }
        assert.strictEqual(Object.keys(registry).length, 100);
        const planFinder = new PlanFinder(registry);

        const steps = planFinder.findBestPlan({type:0},{type:100});
        assert.strictEqual(steps.length, 100);
        assert.deepStrictEqual(steps[50], {
            name: "T50",
            attributes: { 
                input: {
                    type: 50
                },
                output: {
                    type: 51
                }
            }
        });
    });
    it("Simplified transformers for tests > 300 nodes, max nodes reached", async function() {
        const registry = {};

        for (let i=0; i<=301; i++) {
            const tName = `T${i}`;
            registry[tName] = new Transformer(tName, { inputs: { type: i }, outputs: { type: i+1 } });
        }
        assert.strictEqual(Object.keys(registry).length, 302);
        const planFinder = new PlanFinder(registry);

        assert.throws(()=>{
            planFinder.findBestPlan({type:0},{type:301});
        }, RenditionFormatUnsupportedError, "Should throw error when plan cannot be found");        
        
        const plan = planFinder.findBestPlan({type:0},{type:300});
        assert.ok(plan);
    }).timeout(3000);
});

describe("PlanFinder tests - using dummy transformers", function() {
    const tPNG = new Transformer("tPNG", {
        inputs: {
            type: ['image/tiff']
        },
        outputs: {
            type: ['image/png']
        }
    });
    const tTIFF = new Transformer("tTIFF", {
        inputs: {
            type: ['image/png']
        },
        outputs: {
            type: ['image/tiff']
        }
    });
    const tGIF = new Transformer("tGIF", {
        inputs: {
            type: ['image/png']
        },
        outputs: {
            type: ['image/gif']
        }
    });

    const registry = { tPNG, tTIFF, tGIF };
    it("Simple 1 transformer plan", async function() {
        const input = {
            type: 'image/tiff'
        };
        const output = {
            type: 'image/png'
        };

        const steps = new PlanFinder(registry).findBestPlan(input, output);
        assert.deepStrictEqual(steps, [{
            name: "tPNG",
            attributes: { output: output, input: input }
        }]);
    });
    it("Simple 2 transformer plan", async function() {
        const input = {
            type: 'image/tiff'
        };
        const output = {
            type: 'image/gif'
        };

        const steps = new PlanFinder(registry).findBestPlan(input, output);
        assert.deepStrictEqual(steps, [{
            name: "tPNG",
            attributes: { 
                input: input,
                output: { type: 'image/png' }
            }
        }, {
            name: "tGIF",
            attributes: { 
                input: { type: 'image/png' },
                output: output
            }
        }]);
    });
    it("Simple 2 transformer plan -- userData is added to each step", async function() {
        const input = {
            type: 'image/tiff'
        };
        const output = {
            type: 'image/gif',
            userData: {
                path: "file-where-rendition-is-stored"
            }
        };

        const steps = new PlanFinder(registry).findBestPlan(input, output);
        console.log('steps', steps);
        assert.deepStrictEqual(steps, [{
            name: "tPNG",
            attributes: { 
                input: input,
                output: { 
                    type: 'image/png',
                    userData: {
                        path: "file-where-rendition-is-stored"
                    }
                }
            }
        }, {
            name: "tGIF",
            attributes: { 
                input: { type: 'image/png' },
                output: output
            }
        }]);
    });
        
    it("No plan found - no input", async function() {
        const input = {
            type: 'image/psd'
        };
        const output = {
            type: 'image/png'
        };
        assert.throws(()=>{
            new PlanFinder(registry).findBestPlan(input, output);
        }, RenditionFormatUnsupportedError, "Should throw error when plan cannot be found");
    });
    it("No plan found - no output", async function() {
        const input = {
            type: 'image/png'
        };
        const output = {
            type: 'image/psd'
        };
        assert.throws(()=>{
            new PlanFinder(registry).findBestPlan(input, output);
        }, RenditionFormatUnsupportedError, "Should throw error when plan cannot be found");        
    });
    it("Multiple plans - choose first plan available", async function() {
        const tGIF2 = new Transformer("tGIF2", {
            inputs: {
                type: ['image/png']
            },
            outputs: {
                type: ['image/gif']
            }
        });
        registry.tGIF2 = tGIF2;
        const input = {
            type: 'image/tiff'
        };
        const output = {
            type: 'image/gif'
        };

        const steps = new PlanFinder(registry).findBestPlan(input, output);
        assert.deepStrictEqual(steps, [{
            name: "tPNG",
            attributes: { 
                input: input,
                output: { type: 'image/png' }
            }
        }, {
            name: "tGIF",
            attributes: { 
                input: { type: 'image/png' },
                output: output
            }
        }]);
    });

});

// Note: these tests should move to engine.test.js
describe("E2E tests with Pipeline Engine", function () {
    const params = { skipMetadataExtraction: true };

    it("Runs a pipeline with one transformer and one refines the plan", async function() {
        const pipeline = new Engine(params);

        pipeline.registerTransformer(new TransformerPNG());
        pipeline.registerTransformer(new TransformerGIF());

        const input = {
            type: 'image/tiff',
            path: '/tmp/input.png',
            name: 'input.png'
        };
        const output = {
            type: 'image/png'
        };

        const plan = new Plan();
        // TODO: should happen inside transformer
        await pipeline.refinePlan(plan, input, output);

        assertPlan(plan, "[start] -> { transformerPNG* }", [{
            name: "transformerPNG",
            output: {
                type: 'image/png'
            },
            input: input
        }]);
    });

    it("Runs a pipeline with one transformer and refines the plan with two more transformers", async function() {
        const pipeline = new Engine(params);

        pipeline.registerTransformer(new TransformerPNG());
        pipeline.registerTransformer(new TransformerGIF());

        const input = {
            type: 'image/tiff',
            path: '/tmp/input',
            name: 'input.png'
        };
        const output = {
            type: 'image/gif'
        };

        const plan = new Plan();
        // TODO: should happen inside transformer
        await pipeline.refinePlan(plan, input, output);

        assertPlan(plan, "[start] -> { transformerPNG -> transformerGIF* }", [{
            name: "transformerPNG",
            output: {
                type: 'image/png'
            },
            input: {
                type: 'image/tiff',
                path: '/tmp/input',
                name: 'input.png'
            }
        }, {
            name: "transformerGIF",
            input: {
                type: 'image/png'
            },
            output: {
                type: 'image/gif'
            }
        }]);
    });
    it("Runs a pipeline mimicking the sensei use case - sensei doesn't support gif", async function() {
        const pipeline = new Engine(params);

        pipeline.registerTransformer(new TransformerImage());
        pipeline.registerTransformer(new TransformerSensei());

        const input = {
            type: 'image/gif',
            width: 500,
            height: 500
        };
        const output = {
            type: 'machine-json'
        };

        const plan = new Plan();
        await pipeline.refinePlan(plan, input, output);

        assertPlan(plan, "[start] -> { transformerImage -> transformerSensei* }", [{
            name: "transformerImage",
            input: {
                type: 'image/gif',
                width: 500,
                height: 500,
                sourceType: 'LOCAL'
            },
            output: {
                type: 'image/png',
                width: 319,
                height: 319
            }
        }, {
            name: "transformerSensei",
            input: {
                type: 'image/png',
                width: 319,
                height: 319,
                sourceType: 'URL'
            },
            output: {
                type: 'machine-json'
            }
        }]);
    });
    it("Runs a pipeline mimicking the sensei use case - don't convert to png if source is jpeg", async function() {
        const pipeline = new Engine(params);

        pipeline.registerTransformer(new TransformerImage());
        pipeline.registerTransformer(new TransformerSensei());

        const input = {
            type: 'image/jpeg',
            width: 500,
            height: 500
        };
        const output = {
            type: 'machine-json'
        };

        const plan = new Plan();
        await pipeline.refinePlan(plan, input, output);

        assertPlan(plan, "[start] -> { transformerImage -> transformerSensei* }", [{
            name: "transformerImage",
            input: {
                type: 'image/jpeg',
                width: 500,
                height: 500,
                sourceType: 'LOCAL'
            },
            output: {
                type: 'image/jpeg',
                width: 319,
                height: 319
            }
        }, {
            name: "transformerSensei",
            input: {
                type: 'image/jpeg',
                width: 319,
                height: 319,
                sourceType: 'URL'
            },
            output: {
                type: 'machine-json'
            }
        }]);
    });
    it("Runs a pipeline mimicking the sensei use case -- png too large", async function() {
        const pipeline = new Engine(params);

        pipeline.registerTransformer(new TransformerImage());
        pipeline.registerTransformer(new TransformerSensei());

        const input = {
            type: 'image/png',
            width: 500,
            height: 500
        };
        const output = {
            type: 'machine-json'
        };

        const plan = new Plan();
        await pipeline.refinePlan(plan, input, output);

        assertPlan(plan, "[start] -> { transformerImage -> transformerSensei* }", [{
            name: "transformerImage",
            input: {
                type: 'image/png',
                width: 500,
                height: 500,
                sourceType: 'LOCAL'
            },
            output: {
                type: 'image/png',
                width: 319,
                height: 319
            }
        }, {
            name: "transformerSensei",
            input: {
                type: 'image/png',
                width: 319,
                height: 319,
                sourceType: 'URL',
            },
            output: {
                type: 'machine-json'
            }
        }]);
    });
    it("Runs a pipeline mimicking the sensei use case -- no resizing needed", async function() {
        const pipeline = new Engine(params);

        pipeline.registerTransformer(new TransformerImage());
        pipeline.registerTransformer(new TransformerSensei());

        const input = {
            type: 'image/png',
            width: 200,
            height: 200
        };
        const output = {
            type: 'machine-json'
        };

        const plan = new Plan();
        await pipeline.refinePlan(plan, input, output);

        assertPlan(plan, "[start] -> { transformerSensei* }", [{
            name: "transformerSensei",
            input: {
                type: 'image/png',
                width: 200,
                height: 200,
                sourceType: 'URL'
            },
            output: {
                type: 'machine-json'
            }
        }]);
    });
    it("Runs a pipeline mimicking the sensei use case -- no upscaling", async function() {
        const pipeline = new Engine(params);

        pipeline.registerTransformer(new TransformerImage());
        pipeline.registerTransformer(new TransformerSensei());

        const input = {
            type: 'image/gif',
            width: 200,
            height: 200
        };
        const output = {
            type: 'machine-json',
            features: {
                autoTags: true
            }
        };

        const plan = new Plan();
        await pipeline.refinePlan(plan, input, output);

        assertPlan(plan, "[start] -> { transformerImage -> transformerSensei* }", [{
            name: "transformerImage",
            input: {
                type: 'image/gif',
                width: 200,
                height: 200,
                sourceType: 'LOCAL'
            },
            output: {
                type: 'image/png',
                width: 200,
                height: 200
            }
        }, {
            name: "transformerSensei",
            input: {
                type: 'image/png',
                width: 200,
                height: 200,
                sourceType: 'URL'
            },
            output: {
                type: 'machine-json',
                features: {
                    autoTags: true
                }
            }
        }]);
    });

    it("Throws error if no plan refinement does not find matching transformer", async function() {
        const pipeline = new Engine(params);

        pipeline.registerTransformer(new TransformerPNG());
        pipeline.registerTransformer(new TransformerGIF());

        const input = {
            type: 'image/psd'
        };
        const output = {
            type: 'image/gif'
        };

        const plan = new Plan();
        try {
            await pipeline.refinePlan(plan, input, output);
        } catch (error) {
            assert.strictEqual(error.message, "No valid plan found.");
        }
    });

    it("Throws error if asset does not exist (metadata extraction is enabled)", async function() {
        const pipeline = new Engine();

        pipeline.registerTransformer(new TransformerPNG());

        const input = {
            type: 'image/png',
            path: '/tmp/input.png',
            name: 'input.png'
        };
        const output = {
            type: 'image/png'
        };

        const plan = new Plan();
        try {
            await pipeline.refinePlan(plan, input, output);
        } catch (error) {
            assert.ok(error.toString().includes('Reading metadata from rendition failed'), `error message should include 'Reading metadata from rendition failed' but get '${error.toString()}''`);
        }
    });
});



describe('PlanFinder form graphs', function() {
    it("Very simple graph", async function() {
        // Registered transformers would result in the following graphs:
        // T1 -> T2
        // Asking for a transformer that doesn't exist
        const T1 = new Transformer("T1", { inputs: { type: 1 }, outputs:{ type: 2 }});
        const T2 = new Transformer("T2", { inputs: { type: 2 }, outputs:{ type: 3 }});
        const registry = {T1, T2};
        const planFinder = new PlanFinder(registry);

        planFinder.formGraph();
        assert.deepStrictEqual(planFinder.graph.adjacent('T1'), ['T2']);
        assert.deepStrictEqual(planFinder.graph.adjacent('T2'), []);
    });
    it("Disjoint graphs", async function() {
        // Registered transformers would result in the following graphs:
        // T1 -> T2
        // T3
        // Asking for a transformer that doesn't exist
        const T1 = new Transformer("T1", { inputs: { type: 1 }, outputs:{ type: 2 }});
        const T2 = new Transformer("T2", { inputs: { type: 2 }, outputs:{ type: 3 }});
        const T3 = new Transformer("T3", { inputs: { type: 5 }, outputs:{ type: 7 }});
        const registry = {T1, T2, T3};
        const planFinder = new PlanFinder(registry);

        planFinder.formGraph();
        assert.deepStrictEqual(planFinder.graph.graph.topologicalSort(), ['T3','T1', 'T2']);
        assert.deepStrictEqual(planFinder.graph.adjacent('T1'), ['T2']);
        assert.deepStrictEqual(planFinder.graph.adjacent('T2'), []);
        assert.deepStrictEqual(planFinder.graph.adjacent('T3'), []);
    });
    it("More disjoint graphs", async function() {
        // Registered transformers would result in the following graphs:
        // T1 -> T2
        // T3 -> T4
        //  |
        // T5
        // Asking for a transformer that doesn't exist
        const T1 = new Transformer("T1", { inputs: { type: 1 }, outputs:{ type: 2 }});
        const T2 = new Transformer("T2", { inputs: { type: 2 }, outputs:{ type: 3 }});
        const T3 = new Transformer("T3", { inputs: { type: 5 }, outputs:{ type: 7 }});
        const T4 = new Transformer("T4", { inputs: { type: 7 }, outputs:{ type: 8 }});
        const T5 = new Transformer("T5", { inputs: { type: 7 }, outputs:{ type: 9 }});
        const registry = {T1, T2, T3, T4, T5};
        const planFinder = new PlanFinder(registry);

        planFinder.formGraph();
        assert.deepStrictEqual(planFinder.graph.adjacent('T1'), ['T2']);
        assert.deepStrictEqual(planFinder.graph.adjacent('T2'), []);
        assert.deepStrictEqual(planFinder.graph.adjacent('T3'), ['T4', 'T5']);
    });
    it("More complicated graph", async function() {
        // T1 -> T7
        // Simplified Graph looks like this:
        // Ours is ordered however, but for simplicity i removed the arrows
        //        T1
        //      /    |  
        //     T2    T3 
        //    /  \   |     
        //   T4  T6  T7  
        // taken from google: https://i.stack.imgur.com/t5En1.png
        // Plan: [ T1, T3, T7]
        const T1 = new Transformer("T1", { inputs: { type: 1 }, outputs: { type: 2  }});
        const T2 = new Transformer("T2", { inputs: { type: 2 }, outputs: { type: 3  }});
        const T3 = new Transformer("T3", { inputs: { type: 2 }, outputs: { type: 4  }});
        const T4 = new Transformer("T4", { inputs: { type: 3 }, outputs: { type: 10 }});
        const T6 = new Transformer("T6", { inputs: { type: 3 }, outputs: { type: 5  }});
        const T7 = new Transformer("T7", { inputs: { type: 4 }, outputs: { type: 6  }});
        const registry = {T1, T2, T3, T4, T6, T7};
        const planFinder = new PlanFinder(registry);

        planFinder.formGraph();
        assert.deepStrictEqual(planFinder.graph.adjacent('T1'), ['T2', 'T3']);
        assert.deepStrictEqual(planFinder.graph.adjacent('T2'), ['T4', 'T6']);
        assert.deepStrictEqual(planFinder.graph.graph.topologicalSort(), ['T1', 'T3', 'T7', 'T2', 'T6', 'T4']);
    });

    it("Even more complicated graph", async function() {
        // T1 -> T7
        // Simplified Graph looks like this:
        // Ours is ordered however, but for simplicity i removed the arrows
        //           T1
        //      /    |    \
        //     T2    T3   T5
        //    /  \   |     |
        //   T4  T6  T7    |
        //        |        |
        //        ----------
        // Plan: [ T1, T3, T7]
        const T1 = new Transformer("T1", { inputs: { type: 1 }, outputs: { type: 2 }});
        const T2 = new Transformer("T2", { inputs: { type: 2 }, outputs: { type: 3 }});
        const T3 = new Transformer("T3", { inputs: { type: 2 }, outputs: { type: 4 }});
        const T4 = new Transformer("T4", { inputs: { type: 3 }, outputs: { type: 10 }});
        const T5 = new Transformer("T5", { inputs: { type: 5 }, outputs: { type: 1 }});
        const T6 = new Transformer("T6", { inputs: { type: 3 }, outputs: { type: 5 }});
        const T7 = new Transformer("T7", { inputs: { type: 4 }, outputs: { type: 6 }});
        const registry = {T1, T2, T3, T4, T5, T6, T7};
        const planFinder = new PlanFinder(registry);
        planFinder.formGraph();

        assert.deepStrictEqual(planFinder.graph.adjacent('T1'), ['T2', 'T3']);
        assert.deepStrictEqual(planFinder.graph.adjacent('T5'), ['T1']);
    });
});