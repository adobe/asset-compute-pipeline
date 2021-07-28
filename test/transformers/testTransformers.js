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

const Transformer = require("../../lib/transformer");
const Manifest = require("../../lib/manifest");
const fs = require("fs-extra");

class TransformerPNG extends Transformer {
    constructor() {
        super("transformerPNG", new Manifest({
            inputs: {
                type: ['image/tiff']
            },
            outputs: {
                type: ['image/png']
            }
        }));
    }
}
class TransformerGIF extends Transformer {
    constructor() {
        super("transformerGIF", new Manifest({
            inputs: {
                type: ['image/png']
            },
            outputs: {
                type: ['image/gif']
            }
        }));
    }
}

/**
 * This transformer mimicks the sensei use case:
 * requires specific width and height as input
 */
class TransformerSensei extends Transformer {
    constructor() {
        super("transformerSensei", new Manifest({
            inputs: {
                type: ['image/png', 'image/jpeg'],
                width: { "min": 1, "max": 319},
                height: { "min": 1, "max": 319, /*default: (input) => Math.min(input, 319)*/ },
                colorProfile: "rbg",
                sourceType: 'URL'
            },
            outputs: {
                type: "machine-json",
                target: 'intermediateOutput.png'
            }
        }));
    }

    async compute(input, output) {
        console.log("Running Sensei transformer");

        console.log('presigned url is ', input.url);
        console.log('output pat is ', output.path);

        await fs.writeJson(output.path, {url: input.url});
    }

}

class TransformerImage extends Transformer {
    constructor() {
        super("transformerImage", new Manifest({
            inputs: {
                type: ["image/png", "image/jpeg", "image/gif", "image/bmp", "image/svg+xml", "image/sgi"],
                width: { min: 1, max: 2000},
                height: { min: 1, max: 2000 },
                size: { min: 1, max: 15000000 },
                colorProfile: ["rgb", "cmyk"],
                sourceType: 'LOCAL'
            },
            outputs: {
                type: ['image/png', 'image/jpeg', 'image/gif', 'image/tiff', 'image/webp'],
                width: { min: 1, max: 2000},
                height: { min: 1, max: 2000 },
                colorProfile: ["rgb", "cmyk"]
            }
        }));
    }

}
class TransformerPie extends Transformer {
    constructor() {
        super("transformerPie", new Manifest({
            inputs: {
                type: ["image/psd", "image/psd", "image/tiff"],
                width: { min: 1, max: 2000},
                height: { min: 1, max: 2000 },
                colorProfile: ["rgb", "cmyk"]
            },
            outputs: {
                type: ['image/png', 'image/jpeg', 'image/tiff'],
                width: { min: 1, max: 2000},
                height: { min: 1, max: 2000 },
                colorProfile: ["rgb", "cmyk"]
            }
        }));
    }
}

class CopyTransformer extends Transformer {
    constructor() {
        super("copyTransformer", new Manifest({
            inputs: {
                type: ['image/gif']
            },
            outputs: {
                type: ['image/gif']
            }
        }));
    }

    async compute(input, output) {        
        await fs.copy(input.path, output.path);
    }
}

module.exports = { TransformerGIF, TransformerPNG, TransformerSensei, TransformerImage, TransformerPie, CopyTransformer };