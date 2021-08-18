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
describe('getMetadata (not mocked)', function() {
    it("gets orientation metadata from a local file (jpeg) ", async function(){
        const metadata = await getImageMetadata('./test/files/landscape8.jpg');
        assert.strictEqual(metadata.Orientation, "Rotate 270 CW");
    });

    it("gets metadata from a local file w/o orientation (png) ", async function(){
        const metadata = await getImageMetadata('./test/files/red_dot_alpha0.5.png');
        assert.strictEqual(metadata.Orientation, undefined);
    });

    it("gets metadata from a mocked metadata (jpeg) ", async function(){
        child_process._original_execSync = child_process.execSync;
        child_process.execSync = function () {
            console.log('Mocked execSync');
            return JSON.stringify([{
                "SourceFile": "./lakers-2560x1600.jpg",
                "Orientation": "Rotate 270 CW",
                "ExifToolVersion": 12.00,
                "FileName": "lakers-2560x1600.jpg",
                "Directory": "./test/test-files",
                "FileSize": "114 kB",
                "FileModifyDate": "2021:08:06 07:58:16-07:00",
                "FileAccessDate": "2021:08:06 07:58:20-07:00",
                "FileInodeChangeDate": "2021:08:06 07:58:16-07:00",
                "FilePermissions": "rw-r--r--",
                "FileType": "JPEG",
                "FileTypeExtension": "jpg",
                "MIMEType": "image/jpeg",
                "JFIFVersion": 1.01,
                "ResolutionUnit": "None",
                "XResolution": 1,
                "YResolution": 1,
                "ImageWidth": 2560,
                "ImageHeight": 1600,
                "EncodingProcess": "Baseline DCT, Huffman coding",
                "BitsPerSample": 8,
                "ColorComponents": 3,
                "YCbCrSubSampling": "YCbCr4:2:0 (2 2)",
                "ImageSize": "2560x1600",
                "Megapixels": 4.1
            }]);
        };
        const metadata = await getImageMetadata('./test/files/landscape8.jpg');
        assert.strictEqual(metadata.Orientation, "Rotate 270 CW");
        child_process.execSync = child_process._original_execSync;
    });
});