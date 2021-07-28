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
// const debug = require('debug')('test:engine');

const {
    arrayIntersect,
    arrayRangeIntersect,
    rangeIntersect,
    manifestIntersection,
    checkInputMatches,
    bestOfIntersection  
} = require('../lib/plan-finder-utils');
const assert = require('assert');

describe('arrayIntersect', function() {
    it("arrayIntersect invalid - does not throw", () => {
        let intersection = arrayIntersect();
        assert.deepStrictEqual(intersection, []);
        
        intersection = arrayIntersect([]);
        assert.deepStrictEqual(intersection, []);
        
        intersection = arrayIntersect(null, []);
        assert.deepStrictEqual(intersection, []);
        
        intersection = arrayIntersect(undefined, []);
        assert.deepStrictEqual(intersection, []);

        intersection = arrayIntersect('array', []);
        assert.deepStrictEqual(intersection, []);

        intersection = arrayIntersect({}, []);
        assert.deepStrictEqual(intersection, []);

        intersection = arrayIntersect([], []);
        assert.deepStrictEqual(intersection, []);

        intersection = arrayIntersect([1,2,3], []);
        assert.deepStrictEqual(intersection, []);

        intersection = arrayIntersect([1,2,3], [4,5,6]);
        assert.deepStrictEqual(intersection, []);
    });
    it("arrayIntersect positive tests", function() {
        // arrays are the same length
        let intersection = arrayIntersect([1], [1]);
        assert.deepStrictEqual(intersection, [1]);

        // can be strings
        intersection = arrayIntersect(['1', 2], ['1']);
        assert.deepStrictEqual(intersection, ['1']);

        // treats repeats as separate items
        intersection = arrayIntersect([1,1], [1,2]);
        assert.deepStrictEqual(intersection, [1]);

        intersection = arrayIntersect([1,2,3], [1,2]);
        assert.deepStrictEqual(intersection, [1,2]);

        intersection = arrayIntersect([1,2], [1,2,3]);
        assert.deepStrictEqual(intersection, [1,2]);

        intersection = arrayIntersect([...Array(10).keys()], [...Array(10).keys()]);
        assert.deepStrictEqual(intersection, [...Array(10).keys()]);

        intersection = arrayIntersect([...Array(100).keys()], [...Array(10).keys()]);
        assert.deepStrictEqual(intersection, [...Array(10).keys()]);

        intersection = arrayIntersect([...Array(100).keys()], [...Array(100).keys()]);
        assert.deepStrictEqual(intersection, [...Array(100).keys()]);
    });
});
describe('arrayRangeIntersect', function() {
    it("arrayRangeIntersect invalid - does not throw", () => {
        let intersection = arrayRangeIntersect();
        assert.deepStrictEqual(intersection, []);
        
        intersection = arrayRangeIntersect([]);
        assert.deepStrictEqual(intersection, []);
        
        intersection = arrayRangeIntersect(null, {});
        assert.deepStrictEqual(intersection, []);
        
        intersection = arrayRangeIntersect(undefined, {});
        assert.deepStrictEqual(intersection, []);

        intersection = arrayRangeIntersect('array', {});
        assert.deepStrictEqual(intersection, []);

        intersection = arrayRangeIntersect({}, {});
        assert.deepStrictEqual(intersection, []);

        intersection = arrayRangeIntersect([], {});
        assert.deepStrictEqual(intersection, []);

        intersection = arrayRangeIntersect([1,2,3], {});
        assert.deepStrictEqual(intersection, []);

        intersection = arrayRangeIntersect([1,2,3], { min: 4, max: 6});
        assert.deepStrictEqual(intersection, []);
    });
    it("arrayRangeIntersect positive tests", function() {
        let intersection = arrayRangeIntersect([1], { min: 1, max: 1});
        assert.deepStrictEqual(intersection, [1]);

        // aray completely inside range
        intersection = arrayRangeIntersect([1,3], { min: 1, max: 3});
        assert.deepStrictEqual(intersection, [1,3]);

        // range completely in array
        intersection = arrayRangeIntersect([1,2,3,4,5], { min: 1, max: 3});
        assert.deepStrictEqual(intersection, [1,2,3]);

        intersection = arrayRangeIntersect([...Array(10).keys()], { min: 5, max: 20});
        assert.deepStrictEqual(intersection, [5,6,7,8,9]);

        intersection = arrayRangeIntersect([...Array(100).keys()], { min: 0, max: 99});
        assert.deepStrictEqual(intersection, [...Array(100).keys()]);
    });
});

describe('rangeIntersect', function() {
    it("rangeIntersect invalid - does not throw", () => {
        let intersection = rangeIntersect();
        assert.deepStrictEqual(intersection, null);
        
        intersection = rangeIntersect([], {});
        assert.deepStrictEqual(intersection, null);
        
        intersection = rangeIntersect(null, { min: 1, max: 2 });
        assert.deepStrictEqual(intersection, null);
        
        intersection = rangeIntersect(undefined, { min: 1, max: 2 });
        assert.deepStrictEqual(intersection, null);

        intersection = rangeIntersect('range', { min: 1, max: 2 });
        assert.deepStrictEqual(intersection, null);

        intersection = rangeIntersect({}, {});
        assert.deepStrictEqual(intersection, null);

        // no intersection
        intersection = rangeIntersect({ min: 1, max: 2 }, { min: 4, max: 6});
        assert.deepStrictEqual(intersection, null);
    });
    it("rangeIntersect positive tests", function() {
        // same range
        let intersection = rangeIntersect({ min: 1, max: 3 }, { min: 1, max: 3});
        assert.deepStrictEqual(intersection, { min: 1, max: 3 });

        // rangeA completely inside rangeB
        intersection = rangeIntersect({ min: 2, max: 5 }, { min: 1, max: 7});
        assert.deepStrictEqual(intersection, { min: 2, max: 5 });

        // rangeB completely in rangeA
        intersection = rangeIntersect({ min: 1, max: 7}, { min: 2, max: 5 });
        assert.deepStrictEqual(intersection, { min: 2, max: 5 });

        // combined range
        intersection = rangeIntersect({ min: 1, max: 7}, { min: 2, max: 9 });
        assert.deepStrictEqual(intersection, { min: 2, max: 7 });

        intersection = rangeIntersect({ min: 2, max: 9 }, { min: 1, max: 7});
        assert.deepStrictEqual(intersection, { min: 2, max: 7 });

        intersection = rangeIntersect({ min: 0, max: 2000 }, { min: 500, max: 30000});
        assert.deepStrictEqual(intersection, { min: 500, max: 2000 });
    });
});
describe('manifestIntersection', function() {
    it("manifestIntersection invalid - does not throw", () => {
        let intersection = manifestIntersection();
        assert.deepStrictEqual(intersection, {});
        
        intersection = manifestIntersection([], {});
        assert.deepStrictEqual(intersection, {});
        
        intersection = manifestIntersection(null, { id: 1 });
        assert.deepStrictEqual(intersection, {});
        
        intersection = manifestIntersection(undefined, { id: 1 });
        assert.deepStrictEqual(intersection, {});

        intersection = manifestIntersection('range', { id: 1 });
        assert.deepStrictEqual(intersection, {});

        intersection = manifestIntersection({}, {});
        assert.deepStrictEqual(intersection, {});

        intersection = manifestIntersection({min:1, max:2}, {min:'1', max:'2'});
        assert.deepStrictEqual(intersection, {});
    });
    it("manifestIntersection no intersections", () => {
        let intersection = manifestIntersection({ id: 1 }, { id: 2 });
        assert.deepStrictEqual(intersection, {});

        // values are not equal
        intersection = manifestIntersection({ id: 1 }, { id: '1' });
        assert.deepStrictEqual(intersection, {});

        // value and sorted list don't intersect
        intersection = manifestIntersection({ id: 1 }, { id: [2,3,4] });
        assert.deepStrictEqual(intersection, {});

        // value and range don't intersect
        // range and value don't intersect
        intersection = manifestIntersection({ id: 1, id1: { min: 2, max: 4} }, { id: { min: 2, max: 4}, id1: 1 });
        assert.deepStrictEqual(intersection, {});

        // array and range don't intersect
        // range and array don't intersect
        intersection = manifestIntersection({ id: [1,5], id1: { min: 2, max: 4} }, { id: { min: 2, max: 4}, id1: [1,5] });
        assert.deepStrictEqual(intersection, {});

        // range doesn't intersect
        intersection = manifestIntersection({ id: { min: 1, max: 4} }, { id: { min: 5, max: 8} });
        assert.deepStrictEqual(intersection, {});

        intersection = manifestIntersection({ id: 1, name: 'test', type:['image/png', 'image/jpeg'] }, { id: { min: 2, max: 4} });
        assert.deepStrictEqual(intersection, {});

        intersection = manifestIntersection({ id: 1 }, { id1: 1 });
        assert.deepStrictEqual(intersection, {});
    });
    it("manifestIntersection two arrays don't overlap, intersection is empty", function() {
        const intersection = manifestIntersection({ type:['image/png', 'image/jpeg'] }, { type:['image/gif'] });
        assert.deepStrictEqual(intersection, {});
    });
    it("manifestIntersection positive tests", function() {
        // intersection of two values
        let intersection = manifestIntersection({ id: 1, name:'test' }, { id: 1, name:'test' });
        assert.deepStrictEqual(intersection, { id: 1, name:'test'});

        // intersetion of two ranges
        intersection = manifestIntersection({ id: { min: 1, max: 4} }, { id: { min: 2, max: 8} });
        assert.deepStrictEqual(intersection, { id: { min: 2, max: 4 } });

        // intersection of range and sorted list
        intersection = manifestIntersection({ id: { min: 1, max: 4} }, { id: [2,4,6] });
        assert.deepStrictEqual(intersection, { id: [2,4] });

        // intersection of range and value
        intersection = manifestIntersection({ id: { min: 1, max: 4} }, { id: 2 });
        assert.deepStrictEqual(intersection, { id: 2 });

        // intersection of sorted list and range
        intersection = manifestIntersection({ id: [2,4,6] }, { id: { min: 1, max: 4} });
        assert.deepStrictEqual(intersection, { id: [2,4] });

        // intersection of two sorted lists
        intersection = manifestIntersection({ id: [2,4,6] }, { id: [1,2,3,4,5] });
        assert.deepStrictEqual(intersection, { id: [2,4] });

        // intersection of value and range
        intersection = manifestIntersection({ id: 2 }, { id: { min: 1, max: 4} });
        assert.deepStrictEqual(intersection, { id: 2 });

        // intersection of value and sorted list
        intersection = manifestIntersection({ id: 2 }, { id: [1,2,3,4,5] });
        assert.deepStrictEqual(intersection, { id: 2 });

        // intersection of sorted and listvalue 
        intersection = manifestIntersection({ id: [1,2,3,4,5] }, { id: 2 });
        assert.deepStrictEqual(intersection, { id: 2 });
    });
    it("manifestIntersection larger objects", function() {
        // multiple intersections
        let intersection = manifestIntersection({ 
            id: { min: 1, max: 4},
            name:'test' ,
            type: ['image/png', 'image/jpeg', 'image/bmp'],
            jpegQuality: 95
        }, { 
            id: [1,2,3,4,5,6,7,8],
            name:'test2',
            type: 'image/jpeg',
            jpegQuality: { min: 1, max: 95}
        });
        assert.deepStrictEqual(intersection, { id: [1,2,3,4], type: 'image/jpeg', jpegQuality: 95});
        
        
        intersection = manifestIntersection({ 
            id: { min: 1, max: 4},
            name:'test' ,
            type: ['image/png', 'image/jpeg', 'image/bmp'],
            jpegQuality: 95,
            colorspace: ['sRGB', 'CMYK'],
            random: 'random property',
            version: '1.0.0',
            width: { min: 1, max: 200000},
            height: { min: 1, max: 200000},
            size:  { min: 0, max: 3000000000}
        }, { 
            id: [1,2,3,4,5,6,7,8],
            name:'test2',
            type: 'image/jpeg',
            jpegQuality: { min: 1, max: 95},
            colorspace: ['sRGB', 'CMYK'],
            version: 2,
            width: { min: 20, max: 200000},
            height: { min: 20, max: 200000},
            size:  [...Array(10000).keys()],
            wid: '1233'
        });
        console.log(intersection);
        assert.deepStrictEqual(intersection, {
            id: [ 1, 2, 3, 4 ],
            type: 'image/jpeg',
            jpegQuality: 95,
            colorspace: [ 'sRGB', 'CMYK' ],
            width: { min: 20, max: 200000 },
            height: { min: 20, max: 200000 },
            size: [...Array(10000).keys()]
        });
    });
});

describe('checkInputMatches', function() {
    it("checkInputMatches invalid - does not throw, returns false", () => {
        // both invalid
        assert.ok(!checkInputMatches());
        
        // target invalid
        assert.ok(!checkInputMatches([], {}));

        assert.ok(!checkInputMatches(null, { id: 1 }));
        
        assert.ok(!checkInputMatches(undefined, { id: 1 }));

        // input invalid
        assert.ok(!checkInputMatches({}, []));

        assert.ok(!checkInputMatches({ id: 1 }, null));
        
        assert.ok(!checkInputMatches({ id: 1 }, undefined));

    });
    it("checkInputMatches invalid - input attributes has multiple values", () => {
        // input attribute has multiple values
        assert.ok(!checkInputMatches({ id: 1 }, {id: [1,2]}));
        assert.ok(!checkInputMatches({ id: [1,2] }, {id: [1,2]}));
        assert.ok(!checkInputMatches({ id: {min:1, max:2} }, {id: [1,2]}));

        assert.ok(!checkInputMatches({ id: 1 }, {id: {min:1, max:2}}));
        assert.ok(!checkInputMatches({ id: [1,2] }, {id: {min:1, max:2}}));
        assert.ok(!checkInputMatches({ id: {min:1, max:2} }, {id: {min:1, max:2}}));
    });
    it("checkInputMatches - input does not match", () => {
        // id doesn't match
        assert.ok(!checkInputMatches({ id: ['2', '3']}, { id: '1'}));

        assert.ok(!checkInputMatches({ id: {min:2, max:4}}, { id: 1}));

        assert.ok(!checkInputMatches({ id: 2}, { id: 1}));

        assert.ok(!checkInputMatches({ id: true}, { id: false}));

        // only 1 attribute needs to not match for failure
        assert.ok(!checkInputMatches({type: ['1', '2', '3'], id: 2 }, { id: 1, type: '2'}));
    });
    it("checkInputMatches - input must be the same type to match", () => {
        assert.ok(!checkInputMatches({ id: 1}, { id: '1'}));
        assert.ok(!checkInputMatches({ id: 1}, { id: true}));
        assert.ok(!checkInputMatches({ id: '1'}, { id: 1}));
        assert.ok(!checkInputMatches({ id: '1'}, { id: true}));
        assert.ok(!checkInputMatches({ id: true}, { id: '1'}));
        assert.ok(!checkInputMatches({ id: true}, { id: 1}));
    });
    it("checkInputMatches - input matches", () => {
        // target value is sorted list
        assert.ok(checkInputMatches({ id: ['1', '2', '3']}, { id: '1'}));
        // target value is value
        assert.ok(checkInputMatches({ id: '1'}, { id: '1'}));
        // target value is range
        assert.ok(checkInputMatches({ id: {min:1, max:200}}, { id: 1}));
        // target value is boolean
        assert.ok(checkInputMatches({ id: true}, { id: true}));
        // target value is number
        assert.ok(checkInputMatches({ id: 1}, { id: 1}));

        // input has no matching attributes with target, so by default target excepts it
        assert.ok(checkInputMatches({}, {}));
        assert.ok(checkInputMatches({}, { id: '1'}));
        assert.ok(checkInputMatches({ id1: ['1', '2', '3'], test:1}, { id: '1', test2:1}));
    });
    it("checkInputMatches - input matches because target values are not valid", () => {
        // target value invalid -- not string, boolean or number
        assert.ok(checkInputMatches({id: null}, { id: 1 }));
        assert.ok(checkInputMatches({id: undefined}, { id: 1 }));
        assert.ok(checkInputMatches({id: {}}, { id: 1 }));
    });
});

describe('bestOfIntersection', function() {
    it("bestOfIntersection - input matches because target values are not valid", () => {
        // both invalid
        assert.deepStrictEqual(bestOfIntersection(), {});
                
        // obj invalid
        assert.deepStrictEqual(bestOfIntersection([], {}), {});
        assert.deepStrictEqual(bestOfIntersection(null, {}), {});
        assert.deepStrictEqual(bestOfIntersection(undefined, {}), {});

        // input invalid
        assert.deepStrictEqual(bestOfIntersection({},[]), {});
        assert.deepStrictEqual(bestOfIntersection({}, null), {});
        assert.deepStrictEqual(bestOfIntersection({}, undefined), {});
    });
    it("bestOfIntersection - obj has invalid attribute value", () => {
        assert.deepStrictEqual(bestOfIntersection({id: {}}, {}), {});
        assert.deepStrictEqual(bestOfIntersection({id: undefined}, {}), {});
    });
    it("bestOfIntersection - positive tests", () => {
        // case covering all types of attributes
        assert.deepStrictEqual(bestOfIntersection({
            id: {min:1, max:8},
            width: {min:1, max: 300},
            type: ['image/png', 'image/jpeg'],
            size: 1000
        }, {
            width: 150
        }), {
            id:8,
            width: 150,
            type: 'image/png',
            size: 1000
        });
        
    });
    it("bestOfIntersection - no upscaling", () => {
        // do not scale up size, width, and height
        // do not convert type if its supported
        // size is passed through
        const intersectionObject = {
            width: {min:1, max: 300},
            height: {min:1, max: 300},
            type: ['image/png', 'image/jpeg'],
            size: 1000
        };
        const input = {
            width: 150,
            height: 350,
            size: 1000,
            type: 'image/jpeg'
        };
        assert.deepStrictEqual(bestOfIntersection(intersectionObject, input), {
            width: 150,
            height: 300,
            type: 'image/jpeg',
            size: 1000
        });
        
    });

});