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
const { Reason } = require('@adobe/asset-compute-commons');

describe("metadata.js", () => {
    context('extract tests', () => {
        [{
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
        }, {
            name: 'extracts mov metadata',
            input: {
                name: 'file-hd.mov',
                path: 'test/files/file-hd.mov'
            },
            output: {
                "aspectRatio": 1.778,
                "bitrate": 4806466,
                "command": "mediainfo",
                "commandDuration": 61,
                "duration": 2.002,
                "fileSize": 1202818,
                "format": "MPEG-4",
                "framerate": 29.97,
                "height": 1080,
                "isTruncated": false,
                "videoFormat": "AVC",
                "videoFormatProfile": "High",
                "width": 1920
            }
        }].forEach(t => {
            it(t.name, async () => {
                const assetMetadata = new Metadata(t.input);
                await assetMetadata.extract();
                const metadata = assetMetadata.metadata;

                // exclude command duration from mediainfo
                delete t.output.commandDuration;
                delete metadata.commandDuration;

                assert.deepStrictEqual(metadata, t.output);
            });
        });
    });

    context('failure tests', () => {
        [{
            name: 'no source',
            expectedErr: {
                reason: Reason.GenericError,
                msg: 'No source provided'
            }
        }, {
            name: 'no name and mimetype (cannot get extension)',
            input: {},
            expectedErr: {
                reason: Reason.GenericError,
                msg: `Provided source must contain one of 'name' and 'mimetype' fields`
            }
        }, {
            name: 'fail to get extension using only name without extension',
            input: { name: 'test' },
            expectedErr: {
                reason: Reason.GenericError,
                msg: `Cannot determined asset extension`
            }
        }, {
            name: 'fail to get extension using only unknown mimetype',
            input: { mimetype: 'test' },
            expectedErr: {
                reason: Reason.GenericError,
                msg: `Cannot determined asset extension`
            }
        }, {
            name: 'fail to get extension using name without extension and unknown mimetype',
            input: { name: 'test', mimetype: 'test' },
            expectedErr: {
                reason: Reason.GenericError,
                msg: `Cannot determined asset extension`
            }
        }, {
            name: 'valid video asset',
            input: {
                name: 'file-hd.mov',
                path: 'test/files/file-hd.mov'
            },
            runExtract: true,
        }, {
            name: 'video asset neither url nor path',
            input: {
                name: 'file-hd.mov'
            },
            runExtract: true,
            expectedErr: {
                reason: Reason.GenericError,
                msg: `Image source must contain either 'url' or 'path' field for retrieving metadata`
            }
        }, {
            name: 'valid image asset',
            input: {
                name: 'file.jpg',
                path: 'test/files/file.jpg'
            },
            runExtract: true
        }, {
            name: 'image asset without path',
            input: {
                name: 'file.jpg',
                url: 'https://example.com/file.jpg'
            },
            runExtract: true,
            expectedErr: {
                reason: Reason.GenericError,
                msg: `Image source must contain 'path' field for retrieving metadata`
            }
        }].forEach(t => {
            it.only(t.name, async () => {
                let errorOccur = false;
                let assetMetadata;
                try {
                    assetMetadata = new Metadata(t.input);
                    if (t.runExtract) {
                        await assetMetadata.extract();
                    }
                } catch (e) {
                    errorOccur = true;
                    assert.ok(e.toString().includes(t.expectedErr.msg), `error message should includes "${t.expectedErr.msg}"" but get "${e}""`);
                    assert.deepStrictEqual(e.name, t.expectedErr.reason);
                }

                if (!t.expectedErr) {
                    assert.ok(assetMetadata.metadata, 'Metadata should exist');
                } else if (!errorOccur) {
                    assert.fail(`Should have failed with error ${t.expectedErr.reason}: "${t.expectedErr.msg}"`);
                }
            });
            
        });
    });
});