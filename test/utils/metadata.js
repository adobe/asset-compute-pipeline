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
/* eslint mocha/no-mocha-arrows: "off" */

'use strict';

const { Metadata } = require('../../lib/utils');
const assert = require('assert');

describe("metadata.js", () => {
    const extractTests = [{
        name: 'extracts jpg metadata',
        input: {
            name: 'file.jpg',
            path: 'test/files/file.jpg'
        },
        output: {
            SourceFile: 'test/files/file.jpg',
            Orientation: 1,
            FileType: 'JPEG',
            ImageHeight: 288,
            ImageWidth: 512,
            JPEGQualityEstimate: 99
        }
    }, {
        name: 'extracts bmp metadata',
        input: {
            name: 'file.bmp',
            path: 'test/files/file.bmp'
        },
        output: {
            SourceFile: 'test/files/file.bmp',
            FileType: 'BMP',
            ImageHeight: 288,
            ImageWidth: 512,
        }
    }, {
        name: 'extracts gif metadata',
        input: {
            name: 'file.gif',
            path: 'test/files/file.gif'
        },
        output: {
            SourceFile: 'test/files/file.gif',
            FileType: 'GIF',
            ImageHeight: 288,
            ImageWidth: 512,
        }
    }, {
        name: 'extracts png metadata',
        input: {
            name: 'file.png',
            path: 'test/files/file.png'
        },
        output: {
            SourceFile: 'test/files/file.png',
            FileType: 'PNG',
            ImageHeight: 288,
            ImageWidth: 512,
        }
    }, {
        name: 'extracts tif metadata',
        input: {
            name: 'file.tif',
            path: 'test/files/file.tif'
        },
        output: {
            SourceFile: 'test/files/file.tif',
            Orientation: 1,
            FileType: 'TIFF',
            ImageHeight: 288,
            ImageWidth: 512,
        }
    }, {
        name: 'extracts txt metadata',
        input: {
            name: 'file.txt',
            path: 'test/files/file.txt'
        },
        output: {
            SourceFile: 'test/files/file.txt',
            FileType: 'TXT'
        }
    }];
    
    extractTests.forEach(t => {
        it(t.name, async () => {
            const assetMetadata = new Metadata(t.input);
            await assetMetadata.extract();
            assert.deepStrictEqual(assetMetadata.metadata, t.output);
        });
    });
});