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

/*
const transformerContext = {
    step: step,
    transformer: transformer,
    originalInput: plan.originalInput
};
*/

const INTERNAL = Symbol("internal");

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
class TransformerContext {
    constructor(plan, step, transformer) {
        this[INTERNAL] = {};

        this[INTERNAL].step = plan;
        this[INTERNAL].step = step;
        this[INTERNAL].transformer = transformer;

        this[INTERNAL].originalInput = null;
        this[INTERNAL].input = null;
        this[INTERNAL].output = null;

        this[INTERNAL].directory = null;
    }

    // set step(value) {
    //     this[INTERNAL].step = value;
    // }

    // set transformer(value) {
    //     this[INTERNAL].transformer = value;
    // }

    set originalInput(value) {
        this[INTERNAL].originalInput = value;
    }

    set input(value) {
        this[INTERNAL].input = value;
    }

    set output(value) {
        this[INTERNAL].output = value;
    }

    set directory(value) {
        this[INTERNAL].directory = value;
    }

    get plan() {
        return this[INTERNAL].step;
    }

    get step() {
        return this[INTERNAL].step;
    }

    get transformer() {
        return this[INTERNAL].transformer;
    }

    get transformerName() {
        return this[INTERNAL].transformer.name;
    }

    get originalInput() {
        return this[INTERNAL].originalInput;
    }

    get input() {
        return this[INTERNAL].input;
    }

    get output() {
        return this[INTERNAL].output;
    }

    get directory() {
        return this[INTERNAL].directory;
    }
}

module.exports = {
    TransformerContext
};