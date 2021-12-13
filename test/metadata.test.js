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

const Metadata = require('../lib/metadata');
const assert = require('assert');
const { Reason } = require('@adobe/asset-compute-commons');

describe("metadata.js", () => {
    context('extract tests', () => {
        [{
            name: 'extracts bmp metadata',
            input: {
                name: 'file.bmp',
                path: 'test/files/file.bmp'
            },
            output: {
                FileType: 'BMP',
                ImageHeight: 288,
                ImageWidth: 512,
            }
        }, {
            name: 'extracts jpg metadata',
            input: {
                name: 'file.jpg',
                path: 'test/files/file.jpg'
            },
            output: {
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
                FileType: 'TXT'
            }
        }, {
            name: 'extracts sgi metadata (imagemagick)',
            input: {
                name: 'file.sgi',
                path: 'test/files/file.sgi'
            },
            output: {
                FileType: 'SGI',
                ImageHeight: 288,
                ImageWidth: 512,
                JPEGQualityEstimate: undefined,
                Orientation: 'Undefined'
            }
        }, {
            name: 'extracts avi metadata',
            input: {
                name: 'file.avi',
                path: 'test/files/file.avi'
            },
            output: {
                command: "mediainfo",
                format: "AVI",
                fileSize: 91662,
                duration: 2.002,
                framerate: 29.97,
                bitrate: 366282,
                isTruncated: false,
                videoFormat: "MPEG-4 Visual",
                videoFormatProfile: "Simple",
                width: 178,
                height: 100,
                aspectRatio: 1.778
            }
        }, {
            name: 'extracts flv metadata',
            input: {
                name: 'file.flv',
                path: 'test/files/file.flv'
            },
            output: {
                command: "mediainfo",
                format: "Flash Video",
                fileSize: 110437,
                duration: 2.032,
                framerate: 15.25,
                bitrate: 434791,
                isTruncated: false,
                videoFormat: "VP6",
                videoFormatProfile: undefined,
                width: 160,
                height: 120,
                aspectRatio: 1.333
            }
        }, {
            name: 'extracts mov metadata',
            input: {
                name: 'file.mov',
                path: 'test/files/file.mov'
            },
            output: {
                command: "mediainfo",
                format: "MPEG-4",
                fileSize: 68065,
                duration: 4.832,
                framerate: 30,
                bitrate: 112690,
                isTruncated: false,
                videoFormat: "AVC",
                videoFormatProfile: "Main",
                width: 192,
                height: 242,
                aspectRatio: 0.793
            }
        }, {
            name: 'extracts mp4 metadata',
            input: {
                name: 'file.mp4',
                path: 'test/files/file.mp4'
            },
            output: {
                command: 'mediainfo',
                format: 'MPEG-4',
                fileSize: 1055736,
                duration: 5.312,
                framerate: 25,
                bitrate: 1589964,
                isTruncated: false,
                videoFormat: 'AVC',
                videoFormatProfile: 'Main',
                width: 1280,
                height: 720,
                aspectRatio: 1.778
            }
        }, {
            name: 'extracts mpg metadata',
            input: {
                name: 'file.mpg',
                path: 'test/files/file.mpg'
            },
            output: {
                command: "mediainfo",
                format: "MPEG Video",
                fileSize: 349900,
                duration: 4.933,
                framerate: 30,
                bitrate: 567444,
                isTruncated: false,
                videoFormat: "MPEG Video",
                videoFormatProfile: undefined,
                width: 224,
                height: 256,
                aspectRatio: 0.875
            }
        }, {
            name: 'extracts wav metadata',
            input: {
                name: 'file.wav',
                path: 'test/files/file.wav'
            },
            output: {
                command: "mediainfo",
                format: "Wave",
                fileSize: 28524,
                duration: 2.583,
                bitrate: 88344,
                isTruncated: false
            }
        }].forEach(currentTest => {
            it(currentTest.name, async () => {
                const assetMetadata = new Metadata(currentTest.input);
                await assetMetadata.extract();
                const metadata = assetMetadata.metadata;

                // exclude command duration from mediainfo
                delete currentTest.output.commandDuration;
                delete metadata.commandDuration;

                assert.deepStrictEqual(metadata, currentTest.output);
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
            name: 'no name, path, mimetype (cannot get extension)',
            input: {},
            expectedErr: {
                reason: Reason.GenericError,
                msg: `Provided source must contain one of 'name', 'path', or 'mimetype' fields`
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
                msg: `Image source must contain either 'url' or 'path' field to retrieve metadata`
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
                msg: `Image source must contain 'path' field to retrieve metadata`
            }
        }].forEach(currentTest => {
            it(currentTest.name, async () => {
                let errorOccur = false;
                let assetMetadata;
                try {
                    assetMetadata = new Metadata(currentTest.input);
                    if (currentTest.runExtract) {
                        await assetMetadata.extract();
                    }
                } catch (e) {
                    errorOccur = true;
                    assert.ok(e.toString().includes(currentTest.expectedErr.msg), `error message  "${currentTest.expectedErr.msg}"" but get "${e}""`);
                    assert.deepStrictEqual(e.name, currentTest.expectedErr.reason);
                }

                if (!currentTest.expectedErr) {
                    assert.ok(assetMetadata.metadata, 'Metadata should exist');
                } else if (!errorOccur) {
                    assert.fail(`Should have failed with error ${currentTest.expectedErr.reason}: "${currentTest.expectedErr.msg}"`);
                }
            });
            
        });
    });
});