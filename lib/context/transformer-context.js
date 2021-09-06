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

class TransformerContext {
    constructor(step, transformer) {
        const internal = this[INTERNAL] = {};

        internal.step = step;
        internal.transformer = transformer;
        internal.originalInput = null;
    }

    set step(value) {
        this[INTERNAL].step = value;
    }

    set transformer(value) {
        this[INTERNAL].transformer = value;
    }

    set originalInput(value) {
        this[INTERNAL].originalInput = value;
    }
    
    get step() {
        return this[INTERNAL].step;
    }

    get transformer() {
        return this[INTERNAL].transformer;
    }

    get originalInput() {
        return this[INTERNAL].originalInput;
    }
}

module.exports = {
    TransformerContext
};