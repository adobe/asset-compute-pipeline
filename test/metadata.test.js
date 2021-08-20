/* eslint-disable notice/notice */
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

/* eslint-env mocha */
/* eslint mocha/no-mocha-arrows: "error" */

const assert = require('assert');
const { getImageMetadata } = require('../lib/metadata');
const child_process = require('child_process');

// Note: You need exiftool installed locally to run these tests
describe('getMetadata from local file', function() {
    const IMAGE_WITH_ORIENTATION = 'https://raw.githubusercontent.com/adobe/asset-compute-pipeline/NUI-1460/fix/test/files/landscape8.jpg';
    const IMAGE_WITHOUT_ORIENTATION = 'https://raw.githubusercontent.com/adobe/asset-compute-pipeline/NUI-1460/fix/test/files/red_dot_alpha0.5.png';
    const LOCAL_WITH_ORIENTATION = './test/files/landscape8.jpg';
    const LOCAL_WITHOUT_ORIENTATION = './test/files/red_dot_alpha0.5.png';
    const IMAGE_DOWNLOAD_TIMEOUT = 5000;

    it("gets orientation metadata from a local file w/ orientation (jpeg) ", async function(){
        const metadata = await getImageMetadata(LOCAL_WITH_ORIENTATION);
        assert.strictEqual(metadata.Orientation, "Rotate 270 CW");
    });

    it("gets metadata from a local file w/o orientation (png)", async function(){
        const metadata = await getImageMetadata(LOCAL_WITHOUT_ORIENTATION);
        assert.strictEqual(metadata.Orientation, undefined);
    });

    it("attempt to get metadata from Image URL with orientation (jpeg) ", async function(){
        const metadata = await getImageMetadata(IMAGE_WITH_ORIENTATION);
        assert.strictEqual(metadata.Orientation, "Rotate 270 CW");
    }).timeout(IMAGE_DOWNLOAD_TIMEOUT);

    it("attempt to get metadata from Image URL  w/o  Orientation (jpeg) ", async function(){
        const metadata = await getImageMetadata(IMAGE_WITHOUT_ORIENTATION);
        assert.strictEqual(metadata.Orientation, undefined);
    }).timeout(IMAGE_DOWNLOAD_TIMEOUT);

    it("gets metadata from a local file with orientation (mocked) metadata (jpeg) ", async function(){
        child_process._original_execSync = child_process.execSync;
        child_process.execSync = function () {
            console.log('Mocked execSync');
            return JSON.stringify([{
                "ImageHeight": 1600,
                "EncodingProcess": "Baseline DCT, Huffman coding",
                "BitsPerSample": 8,
                "Orientation": "Rotate 270 CW"
            }]);
        };
        const metadata = await getImageMetadata(LOCAL_WITH_ORIENTATION);
        assert.strictEqual(metadata.Orientation, "Rotate 270 CW");
        child_process.execSync = child_process._original_execSync;
    });

    it("gets metadata from a local file w/o orientation with (mocked) metadata (jpeg) ", async function(){
        child_process._original_execSync = child_process.execSync;
        child_process.execSync = function () {
            console.log('Mocked execSync');
            return JSON.stringify([{
                "ImageHeight": 1600,
                "EncodingProcess": "Baseline DCT, Huffman coding"
            }]);
        };
        const metadata = await getImageMetadata(LOCAL_WITHOUT_ORIENTATION);
        assert.strictEqual(metadata.Orientation, undefined);
        child_process.execSync = child_process._original_execSync;
    });

    it("get metadata from Image URL with (mocked) metadata with orientation (jpeg) ", async function(){
        child_process._original_execSync = child_process.execSync;
        child_process.execSync = function () {
            console.log('Mocked execSync');
            return JSON.stringify([{
                "ImageHeight": 1600,
                "BitsPerSample": 8,
                "ImageSize": "2560x1600",
                "Megapixels": 4.1,
                "Orientation": "Rotate 270 CW"
            }]);
        };
        const metadata = await getImageMetadata(IMAGE_WITH_ORIENTATION);
        assert.strictEqual(metadata.Orientation, "Rotate 270 CW");
        child_process.execSync = child_process._original_execSync;
    });

    it("attempt to get metadata from Image URL w/o orientation (mocked) metadata (jpeg) ", async function(){
        child_process._original_execSync = child_process.execSync;
        child_process.execSync = function () {
            console.log('Mocked execSync');
            return JSON.stringify([{
                "ImageHeight": 1600,
                "YCbCrSubSampling": "YCbCr4:2:0 (2 2)",
                "ImageSize": "2560x1600",
                "Megapixels": 4.1
            }]);
        };
        const metadata = await getImageMetadata(IMAGE_WITHOUT_ORIENTATION);
        assert.strictEqual(metadata.Orientation, undefined);
        child_process.execSync = child_process._original_execSync;
    });
});