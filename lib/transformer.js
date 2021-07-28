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

const Manifest = require('./manifest');
//const debug = require('debug')('pipeline:transformer');
const debug = console.log;

/**
 * Components that can do a certain transformation or operation on an asset.
 */
class Transformer {
    /*
    Transformer PSDRenditions manifest example
    - manifest.outputs
        - type: ["PNG", "JPEG", "TIFF"]
        - width: [1-*]
        - height: [1-*]
        - quality: [0-100]
        - colorspace: RGB
    - checkInputMatches => if type == PSD
    - checkOutputMatches => if type in [PNG, JPEG]

    Transformer SenseiImageTagging manifest example
    - manifest.inputs
            - type: ["PNG"]
            - width: [1-319]
            - height: [1-319]
            - quality: [0-100]
            - colorspace: RGB
            - file size
            - ...
    - checkInputMatches => if type == PNG && size == 319

    Transformer video worker manifest example
    - manifest.inputs
        - type: ["MPEG", "WMV", "MOV"]
        - width: [1-319]
        - height: [1-319]
        - colorspace: RGB
        - fps
        - bitrate
        - length
        - file size
        - ...
    - checkInputMatches => if type ["MPEG", "WMV", "MOV"]

    Transformer text worker manifest example
    - manifest.inputs
        - type: ["DOC", "TXT", "RTF"]
        - colorspace: RGB
        - language
        - file size
        - length (word count?)
        - ...
    - checkInputMatches => if type in ["DOC", "TXT", "RTF"]
    */
    constructor(name, manifest, options={}) {
        this._name = name;

        this._manifest = manifest instanceof Manifest ? manifest : new Manifest(manifest || {});
        
        this._options = options;
    }

    get options() {
        return this._options;
    }

    get name() {
        /*
            - names must be unique in a certain worker, sdk and core
            - names should be unique in the registry
            - clarify namespace handling
        */
        return this._name;
    }

    // e.g. "local", "remote", "..."
    get type() { return ""; }

    get manifest() {
        return this._manifest;
    }

    get inputs() {
        return this.manifest.inputs;
    }
    get outputs() {
        return this.manifest.outputs;
    }

    /**
     * Compute
     * 
     * Leverages this.input (Asset) and this.output (Rendition)
     * to produce an output file written to this.output.path
     * 
     * See /transformers folder for examples
     * 
     * Same parameters as renditionCallback function in the SDK,
     * goal would be to map this 1:1
     * internal-repo/nui/worker-flite/blob/master/action/worker.js#L317
     */
    async compute(input, output, transformerContext) {
        debug('Transformer input', input);
        debug('Transformer output', output);
        debug('Transformer output', transformerContext);
    }

    /**
     * Prepare transformer for compute method
     * - Create unique working directory for the transformer
     * - Convert step.attributes into input (Asset) and output (Rendition) objects on the transformer
     * 
     * @param {Step} step Current step in the Plan containing the transformer name and an object of attributes
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
                }
            }
        }
     */
}

module.exports = Transformer;
