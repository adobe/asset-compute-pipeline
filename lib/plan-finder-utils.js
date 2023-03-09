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

// Helper functions for planFinder
// mainly in its own file to clean up code and for unit testing
const SENSEI_REQUEST_FLAG = 'senseiRequestFlag';

function isArray(array) {
    return Array.isArray(array);
}
function isValidNumber(x) {
    return typeof x === 'number' && !isNaN(x) && isFinite(x);
}
function isObject(obj) {
    return obj !== null && obj !== undefined && !isArray(obj);
}
function isValue(val) {
    return val !== null && val !== undefined && (typeof val === 'boolean' || isValidNumber(val) || typeof val === 'string');
}
function isRange(obj) {
    return isObject(obj) && isValidNumber(obj.min) && isValidNumber(obj.max);
}

/**
 * Check two arrays interect
 * @param {Array} a 
 * @param {Array} b 
 */
function arrayIntersect(a, b) {
    if (!isArray(a) || !isArray(a)) {
        return [];
    }
    const setA = new Set(a);
    const setB = new Set(b);
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    return Array.from(intersection);
}

function arrayRangeIntersect(arrayA, rangeB) {
    if (!isArray(arrayA) || !isRange(rangeB)) {
        return [];
    }
    const intersectArray = [];
    arrayA.forEach(a => {
        if (a >= rangeB.min && a <= rangeB.max) {
            intersectArray.push(a);
        }
    });
    return intersectArray;
}


/**
 * @typedef {Object} Range
 *  
 * @property {Number} min number signifying the min value of the range
 * @property {Number} max number signifying the max value of the range
 */
/**
 * Find intersection of two ranges
 * @param {Range} rangeA 
 * @param {Range} rangeB
 * @returns Range object containing intersecting range or null if ranges don't intersect 
 */
function rangeIntersect(rangeA,rangeB) {
    if (!isRange(rangeA) || !isRange(rangeB)) {
        return null;
    }
    // both are ranges, find intersection of range
    const containsMin = (rangeA.min < rangeB.min) ? rangeA:rangeB;
    const containsMax = (containsMin === rangeB)? rangeA:rangeB;
    if (containsMin.max < containsMax.min) {
        // containsMin ends before containsMax range starts
        // no intersection between ranges
        return null;
    } else {
        return {
            min: containsMax.min,
            max: (containsMin.max < containsMax.max) ? containsMin.max : containsMax.max 
        };
    }
}

/**
 * @typedef {Object} ManifestInput,ManifestOutput
 *  Inputs or Outputs manifest object containing n attributes that are either:
 * 1. object (range)
 * 2. array (priority list)
 * 3. value (boolean, string or number)
 */
/**
 * Two manifest.inputs/outputs objects a,b with n amount of attributes
 * Typically, comparing the manifest.outputs of a transformer 
 * with the manifest.inputs of a different transformer
 * @param {ManifestInput} outputA 
 * @param {ManifestOutput} inputB 
 * @returns a new object of the intersection of the two objects
 */
function manifestIntersection(outputA,inputB) {
    const intersectionObject = {};
    if (!isObject(outputA) || !isObject(inputB)) {
        return intersectionObject;
    }
    const outputAttributes = Object.keys(outputA);
    const inputAttributes = Object.keys(inputB);
    const intersectingAttr = arrayIntersect(outputAttributes, inputAttributes);
    intersectingAttr.forEach(attribute => {
        // can be object (range), array (priority list), single value
        // boolean, number, or string
        const outputValA = outputA[attribute];
        const inputValB = inputB[attribute];

        // find intersection of two ranges
        if (isRange(outputValA) && isRange(inputValB)) {
            const range = rangeIntersect(outputValA,inputValB);
            if (range !== null && isRange(range)) {
                intersectionObject[attribute] = range; 
            }
        }
        // find intersection of range and priority list
        if (isRange(outputValA) && isArray(inputValB)) {
            const intersectArray = arrayRangeIntersect(inputValB, outputValA);
            if (intersectArray.length > 0) {
                intersectionObject[attribute] = intersectArray;
            }
        }
        // find intersection of range and value
        if (isRange(outputValA) && isValue(inputValB)) {
            if (inputValB >= outputValA.min && inputValB <= outputValA.max) {
                intersectionObject[attribute] = inputValB;
            }
        }
        // find intersection of priority list and range
        if (isArray(outputValA) && isRange(inputValB)) {
            const intersectArray = arrayRangeIntersect(outputValA, inputValB);
            if (intersectArray.length > 0) {
                intersectionObject[attribute] = intersectArray;
            }
        }
        // find intersection of two priority lists
        if (isArray(outputValA) && isArray(inputValB)) {
            const intersectArray = arrayIntersect(outputValA, inputValB);
            if (intersectArray.length > 0) {
                intersectionObject[attribute] = intersectArray;
            }
        }
        // find intersection of priority list and value
        if (isArray(outputValA) && isValue(inputValB)) {
            if (outputValA.includes(inputValB)) {
                intersectionObject[attribute] = inputValB;
            }
        }
        // find intersection of value and range
        if (isValue(outputValA) && isRange(inputValB)) {
            // range and value
            if (outputValA >= inputValB.min && outputValA <= inputValB.max) {
                intersectionObject[attribute] = outputValA;
            }
        }
        // find intersection of value and priority list
        if (isValue(outputValA) && isArray(inputValB)) {
            if (inputValB.includes(outputValA)) {
                intersectionObject[attribute] = outputValA;
            }
        }
        // find intersection of two values
        if (isValue(outputValA) && isValue(inputValB)) {
            if (outputValA === inputValB) {
                intersectionObject[attribute] = outputValA;
            }
        }
    });
    return intersectionObject;
}

// check if input meets all the qualifications of target object
/**
 * 
 * Check transformer can handle input
 * 
 * Defaults to checking the input.type
 * @param {Object} input input object in an engine pipeline
 * ex: input object will include at least type:
 *     {
 *          type: "image/tiff",
 *          width: 400,
 *          watermark: true
 *          ... any other relevant source metadata
 *          // attributes will be either numbers, booleans, or strings
 *     }
 * @param {*} target inputs/outputs object from transformer manifest following manifest rules:
 *  Rules:
 *   - must have inputs and outputs defined
 *   - inputs and outputs can have many attributes
 *   - attribute can be string, number, or boolean
 *   - attribute can be defined as range (object), priority list (array), or singular item
 *   - empty array means you don't support it
 *   - if you leave attribute out, you accept it
 *   - if not defined, it accepts it 
 */
function checkInputMatches(target, input) {
    if (!isObject(target) || !isObject(input)) {
        return false;
    }
    let match = true;
    Object.keys(input).forEach(attribute => {
        // if inputs contains attribute, check input[attribute] meets qualifications
        // if inputs does not contain attribute, assume there are no restrictions and its supported
        const inputValue = input[attribute];
        const targetValues = target[attribute];
        console.log(`$$$$ attribute  : ${attribute}`);
        console.log(`$$$$ ${attribute} inputValue : `,inputValue);
        console.log(`$$$$ ${attribute} targetValues : `, targetValues);
        if (targetValues) {
            // if array, its assume its an priority list
            if (isArray(targetValues)) {
                if (!targetValues.includes(inputValue)) {
                    match = false;
                }
            } else if (isRange(targetValues)) {
                if (!(inputValue >= targetValues.min && inputValue <= targetValues.max)) {
                    match = false;
                }
            } else if (typeof targetValues === 'string') {
                console.log(`$$$$ attribute inputValue string: ${inputValue}`);
                console.log(`$$$$ attribute targetValues string: ${targetValues}`);
                if (typeof inputValue !== 'string' || targetValues !== inputValue) {
                    match = false;
                }
            } else if (typeof targetValues === 'boolean') {
                if (typeof inputValue !== 'boolean' || targetValues !== inputValue) {
                    match = false;
                }
            } else if (typeof targetValues === 'number') {
                if (typeof inputValue !== 'number' || targetValues !== inputValue) {
                    match = false;
                }
            }
        }
    });
    // handle special sensei cases
    const senseiFeature = target[SENSEI_REQUEST_FLAG];
    if (match && senseiFeature && input.features) {
        const inputSenseiFeature = input.features[senseiFeature];
        return inputSenseiFeature !== false && inputSenseiFeature !== undefined && inputSenseiFeature !== null;
    }
    return match;
}

/**
 * Find the "best" possible inputs/outputs object from the
 * intersection object
 * 
 * ex:
 * obj = {
 *      type: ['image/png', 'image/jpeg'],
 *      width: { min: 1, max: 319 },
 *      height: { min: 1, max: 319 },
 *      colorspace: 'sRGB'
 *  }
 * 
 * will return the following object:
 *  {
 *      type: 'image/png',
 *      width: 319,
 *      height: 319,
 *      colorspace: 'sRGB'
 *  }
 * @param {Object} obj intersection object
 * @param {Object} input input object to take into account for upscaling and unneeded type conversion
 */
function bestOfIntersection(obj, input) {
    const bestObj = {};
    if (!isObject(obj) || !isObject(input)) {
        return bestObj;
    }
    Object.keys(obj).forEach(attribute => {
        const val = obj[attribute];
        let bestVal;
        // if priority list, take first attribute
        if (isArray(val)) {
            bestVal = val[0];
        }
        // if range, take "max" as best
        else if (isRange(val)) {
            bestVal = val.max;
        }
        // if singular value, there is only one option for best
        else if (isValue(val)) {
            bestVal = val;
        }

        // if input object contains attribute,
        // adjust to make sure it fit means of input
        // for example: if best value is larger than input, 
        // adjust it down to avoid upscaling
        if ((attribute === 'width' || attribute === 'height') && input[attribute]) {
            bestVal = Math.min(input[attribute], bestVal);
        }
        // preserve input.type if it is in intersection object even if its not the first choice
        // example: transformer may prefer png to jpeg, but if the source is a jpeg,
        // we prefer not to convert unless needed
        if ((attribute === 'type') && input.type) {
            if (isArray(val) && val.includes(input.type)) {
                bestVal = input.type;
            }
        } 

        // edge case: if somehow an invalid value makes it all the way to here
        if (bestVal !== undefined && isValue(bestVal)) {
            bestObj[attribute] = bestVal;
        }
    });
    return bestObj;
}

module.exports = {
    arrayIntersect,
    arrayRangeIntersect,
    rangeIntersect,
    manifestIntersection,
    checkInputMatches,
    bestOfIntersection  
};
