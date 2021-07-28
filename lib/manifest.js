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

/**
 * Component containing information about the steps needed to produce a rendition.
   Rules:
    - must have inputs and outputs defined
    - inputs and outputs can have many attributes
    - attribute can be string, number, or boolean
    - attribute can be defined as range (object), ordered set (array), or singular item
    - empty array means you don't support it 
    - if you leave attribute out, you accept it
    - if not defined, it accepts it

    example:

    inputs: {
        type: ['image/tiff'],
        sourceType: 'URL', // LOCAL
        width: { min: 2000, max: 200000},
        height: { min: 2000, max: 200000 },
        alphaChannel: []
    },
    outputs: {
        type: ['image/png'],
        width: { min: 0, max: 2000},
        height: { min: 0, max: 2000 }
    },
    
    idea in outputs to reverse this logic: if not declared, it doesn't support it
    - plan finding level: remove userData
    - for output, do not ignore attributes that are left out
    - have list of known supported fields for manifests
    - if field is not in list of supported fields, filter it out:
        - userData, auth, embedIOEvent
        - error out on unknown fields
    - alternative approach, match the one that matches more fields, so thats more preferred? // a bit of a flakey approach
    
    // other options we did not choose for reference in case we want to change range:
    width: {"exclusiveMinimum": 1, "inclusiveMaximum": 500 } // leave out if no restrictions
    height: {"minimum": 0, "maximum": 500 }

    width: {">": 1, "<=": 500 } // leave out if no restrictions
    height: {">=": 0, "<=": 500 }

    width: {"low": 1, "high": 319 } // leave out if no restrictions

    width >= 1 && width <= 319
}
   */
class Manifest {
    constructor(settings={}) {
        this.settings = settings;
    }

    get inputs(){
        return this.settings.inputs;
    }

    get outputs(){
        return this.settings.outputs;
    }

    get instructions(){
        return this.settings.instructions;
    }

    get name() {
        return this.settings.name;
    }
}


module.exports = Manifest;