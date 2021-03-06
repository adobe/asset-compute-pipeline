/*
 * Copyright 2020 Adobe. All rights reserved.
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

const assert = require('assert');
const mockFs = require('mock-fs');

const { Storage } = require('../../lib/storage');
const nock = require('nock');
const proxyquire =  require('proxyquire');
const fs = require('fs-extra');
const path = require('path');
const { GenericError } = require('@adobe/asset-compute-commons');


const EMBED_LIMIT_MAX = 32 * 1024;
describe('storage.js', () => {

    describe('getAsset', () => {
        beforeEach(() => {
            mockFs();
        });

        afterEach( () => {
            nock.cleanAll();
            mockFs.restore();
            delete process.env.WORKER_TEST_MODE;
            delete process.env.ASSET_COMPUTE_DISABLE_RETRIES;
        });

        it('should download simple png and return a new source object', async () => {
            const assetReference = {
                url: 'https://example.com/photo/elephant.png',
                size: 11,
                type: 'image/png'
            };
            const directory = './in/fakeSource/filePath';
            const name = 'source.png';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(directory));

            nock('https://example.com')
                .get('/photo/elephant.png')
                .reply(200,  "hello world", {
                    'content-type': 'image/png',
                    'content-length': 11
                });

            const source = await Storage.getAsset(assetReference, directory, name);

            assert.strictEqual(source.name, 'source.png');
            assert.strictEqual(source.path, 'in/fakeSource/filePath/source.png');
            assert.ok(nock.isDone());
        });

        it('should download png and use basic auth headers', async () => {
            const assetReference = {
                url: 'https://example.com/photo/elephant.png',
                size: 11,
                type: 'image/png',
                headers: {
                    'Authorization': 'Basic base64stringGoesHere'
                }
            };
            const directory = './in/fakeSource/filePath';
            const name = 'source.png';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(directory));

            nock('https://example.com')
                .get('/photo/elephant.png')
                .matchHeader('Authorization', 'Basic base64stringGoesHere')
                .reply(200, "hello world", {
                    'content-type': 'image/png',
                    'content-length': 11
                });

            const source = await Storage.getAsset(assetReference, directory, name);

            assert.strictEqual(source.name, 'source.png');
            assert.strictEqual(source.path, 'in/fakeSource/filePath/source.png');
            assert.ok(nock.isDone());
        });

        it('should download png and use bearer token auth auth headers', async () => {
            const assetReference = {
                url: 'https://example.com/photo/elephant.png',
                size: 11,
                type: 'image/png',
                headers: {
                    'Authorization': 'Bearer thereGoesTheToken'
                }
            };
            const directory = './in/fakeSource/filePath';
            const name = 'source.png';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(directory));

            nock('https://example.com')
                .get('/photo/elephant.png')
                .matchHeader('Authorization', 'Bearer thereGoesTheToken')
                .reply(200, "hello world", {
                    'content-type': 'image/png',
                    'content-length': 11
                });

            const source = await Storage.getAsset(assetReference, directory, name);

            assert.strictEqual(source.name, 'source.png');
            assert.strictEqual(source.path, 'in/fakeSource/filePath/source.png');
            assert.ok(nock.isDone());
        });

        it('should download data uri and return new source object', async () => {
            const assetReference = {
                url: 'data:text/plain;base64,SGVsbG8sIFdvcmxkIQ%3D%3D'
            };
            const directory = './in/fakeSource/filePath';
            const name = 'source';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(directory));

            const source = await Storage.getAsset(assetReference, directory, name);

            assert.strictEqual(source.name, 'source');
            assert.strictEqual(source.path, 'in/fakeSource/filePath/source');
            assert.ok(fs.existsSync(source.path));
            assert.strictEqual(fs.readFileSync(source.path).toString(), 'Hello, World!');
            assert.ok(nock.isDone());
        });
      
        it('should upload data uri to storage and return presigned url when disabled download is true', async () => {
            const assetReference = {
                url: 'data:text/plain;base64,SGVsbG8sIFdvcmxkIQ%3D%3D'
            };
            const directory = './in/fakeSource/filePath';
            const name = 'source';
            const disableSourceDownload = true;

            
            mockFs.restore();
            const { Storage } = proxyquire('../../lib/storage', {
                './datauri': {
                    getPreSignedUrl : (source) => {
                        console.log('Mocked source : ' + source);
                        return 'https://example.com/preSignedUrl';
                    },
                    download : () => {
                        console.log('Fake file downloaded');
                    }
                }
            });
            mockFs({'./in/fakeSource/filePath': {}});
            // This is mocked to pass the fileExistsCheck
            fs.writeFileSync('./in/fakeSource/filePath/source','something');
            assert.ok(fs.existsSync(directory));
            const source = await Storage.getAsset(assetReference, directory, name, disableSourceDownload);
            console.log(source);
            assert.strictEqual(source.name, 'source');
            assert.strictEqual(source.path, 'in/fakeSource/filePath/source');
            assert.strictEqual(source.params.url, 'https://example.com/preSignedUrl');
        });

        it('should not generate presignurl when source url is http when disabled download is true', async () => {
            const assetReference = {
                url: 'https://nondatauriurl.com/example.png'
            };
            
            mockFs.restore();

            const { Storage } = proxyquire('../../lib/storage', {
                './datauri': {
                    getPreSignedUrl : (source) => {
                        console.log('Mocked source : ' + source);
                        return 'https://example.com/preSignedUrl';
                    },
                    download : () => {
                        console.log('Fake file downloaded');
                    }
                }
            });
            
            const directory = './in/fakeSource/filePath';
            const name = 'source';
            const disableSourceDownload = true;

            const source = await Storage.getAsset(assetReference, directory, name, disableSourceDownload);
            assert.strictEqual(source.name, 'source');
            assert.strictEqual(source.path, 'in/fakeSource/filePath/source');
            assert.strictEqual(source.params.url, 'https://nondatauriurl.com/example.png');
        });

        it("should fail to generate preSignUrl for  empty data uri", async() =>{
            const assetReference = {
                url: "data:,"
            };
            const directory = './in/fakeSource/filePath';
            const name = 'source';
            const disableSourceDownload = true;
            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(directory));
            try {
                await Storage.getAsset(assetReference, directory, name, disableSourceDownload);
            } catch (e) {
                assert.strictEqual(e.name, 'SourceUnsupportedError');
                assert.strictEqual(e.message, 'Invalid or missing local file in/fakeSource/filePath/source');
            }
        });

        it("should fail to generate preSignUrl for non existent file", async() =>{
            const assetReference = {
                url: "data:,"
            };
            const directory = './in/fakeSource/filePath';
            const name = 'source';
            const disableSourceDownload = true;
            mockFs.restore();
            const { Storage } = proxyquire('../../lib/storage', {
                './datauri': {
                    getPreSignedUrl : (source) => {
                        console.log('Mocked source : ' + source);
                        return 'https://example.com/preSignedUrl';
                    },
                    download : () => {
                        console.log('Fake file downloaded');
                    }
                }
            });
            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(directory));
            try {
                await Storage.getAsset(assetReference, directory, name, disableSourceDownload);
            } catch (e) {
                assert.strictEqual(e.name, 'SourceUnsupportedError');
                assert.strictEqual(e.message, 'Invalid or missing local file in/fakeSource/filePath/source');
            }
        });    

        it('should fail to download, no asset reference', async () => {
            try {
                await Storage.getAsset();
                assert.fail('Should fail');
            } catch (error) {
                assert.strictEqual(error.message, 'Missing assetReference');
            }
        });

        it('asset reference is a string, should be turned into an object', async () => {
            const assetReference = 'https://example.com/photo/elephant.png';
            const directory = './in/fakeSource/filePath';
            const name = 'source.png';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(directory));

            nock('https://example.com')
                .head('/photo/elephant.png')
                .reply(200, 'OK', {
                    'content-type': 'image/png',
                    'content-length': 11
                });
            nock('https://example.com')
                .get('/photo/elephant.png')
                .reply(200, 'hello world', {
                    'content-type': 'image/png',
                    'content-length': 11
                });

            const source = await Storage.getAsset(assetReference, directory, name);

            assert.strictEqual(source.name, 'source.png');
            assert.strictEqual(source.path, 'in/fakeSource/filePath/source.png');
            assert.ok(nock.isDone());
        });
    });
    describe('getSource', () => {

        beforeEach(() => {
            mockFs();
        });

        afterEach( () => {
            nock.cleanAll();
            mockFs.restore();
            delete process.env.WORKER_TEST_MODE;
            delete process.env.ASSET_COMPUTE_DISABLE_RETRIES;
        });
        it('should download simple png and return a new source object', async () => {
            const paramsSource = {
                url: 'https://example.com/photo/elephant.png',
                size: 11,
                type: 'image/png'
            };
            const inDirectory = './in/fakeSource/filePath';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(inDirectory));

            nock('https://example.com')
                .get('/photo/elephant.png')
                .reply(200, 'hello world', {
                    'content-type': 'image/png',
                    'content-length': 11
                });

            const source = await Storage.getSource(paramsSource, inDirectory);

            assert.strictEqual(source.name, 'source.png');
            assert.strictEqual(source.path, 'in/fakeSource/filePath/source.png');
            assert.ok(nock.isDone());
        });

        it('should download data uri and return new source object', async () => {
            const paramsSource = {
                url: 'data:text/plain;base64,SGVsbG8sIFdvcmxkIQ%3D%3D'
            };
            const inDirectory = './in/fakeSource/filePath';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(inDirectory));

            const source = await Storage.getSource(paramsSource, inDirectory);

            assert.strictEqual(source.name, 'source');
            assert.strictEqual(source.path, 'in/fakeSource/filePath/source');
            assert.ok(fs.existsSync(source.path));
            assert.strictEqual(fs.readFileSync(source.path).toString(), 'Hello, World!');
            assert.ok(nock.isDone());
        });

        it('should fail during download', async () => {
            process.env.ASSET_COMPUTE_DISABLE_RETRIES = true; // disable retries to test upload failure
            const paramsSource = {
                url: 'https://example.com/photo/elephant.png',
                size: 11,
                type: 'image/png'
            };
            const inDirectory = './in/fakeSource/filePath';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(inDirectory));

            nock('https://example.com')
                .get('/photo/elephant.png')
                .reply(404, 'ok');

            let threw = false;
            try {
                await Storage.getSource(paramsSource, inDirectory);
            } catch (e) {
                console.log(e);
                assert.ok(e instanceof GenericError);
                assert.strictEqual(e.message, "GET 'https://example.com/photo/elephant.png' failed with status 404");
                threw = true;
            }
            assert.ok(threw);
        });

        it('should not download a file in worker test mode', async () => {
            process.env.WORKER_TEST_MODE = true;
            const paramsSource = {
                url: 'file.jpg'
            };
            const inDirectory = '/in';

            mockFs({ '/in/file.jpg': 'yo' });

            const source = await Storage.getSource(paramsSource, inDirectory);

            assert.strictEqual(source.name, 'file.jpg'); // in this case source name is actual file path
            assert.strictEqual(source.path, '/in/file.jpg');
        });

        it('should fail to download because path ends with /..', async () => {
            process.env.WORKER_TEST_MODE = true;
            const paramsSource = {
                url: 'file.jpg/..'
            };
            const inDirectory = '/in';

            let threw = false;
            try {
                await Storage.getSource(paramsSource, inDirectory);
            } catch (e) {
                assert.strictEqual(e.message, 'Invalid or missing local file file.jpg/..');
                threw = true;
            }
            assert.ok(threw);
        });

        it('should fail because of invalid localfile in worker test mode', async () => {
            process.env.WORKER_TEST_MODE = true;
            const paramsSource = {
                url: 'file/../../../evilcode/elephant.jpg'
            };
            const inDirectory = '/in';
            let threw = false;
            try {
                await Storage.getSource(paramsSource, inDirectory);
            } catch (e) {
                assert.strictEqual(e.message, 'Invalid or missing local file file/../../../evilcode/elephant.jpg');
                threw = true;
            }
            assert.ok(threw);
        });

        it('should fail because of missing localfile in worker test mode', async () => {
            process.env.WORKER_TEST_MODE = true;
            const paramsSource = {
                url: 'elephant.jpg'
            };
            const inDirectory = '/in';
            let threw = false;
            try {
                await Storage.getSource(paramsSource, inDirectory);
            } catch (e) {
                assert.strictEqual(e.message, 'Invalid or missing local file elephant.jpg');
                threw = true;
            }
            assert.ok(threw);
        });

        it('paramsSource has source name, but will still be called `source.png` internally', async () => {
            const paramsSource = {
                url: 'https://example.com/photo/elephant.png',
                name: '!@#$%^&*().png',
                size: 11,
                type: 'image/png'
            };
            const inDirectory = './in/fakeSource/filePath';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(inDirectory));

            nock('https://example.com')
                .get('/photo/elephant.png')
                .reply(200, 'hello world', {
                    'content-type': 'image/png',
                    'content-length': 11
                });

            const source = await Storage.getSource(paramsSource, inDirectory);

            assert.strictEqual(source.name, 'source.png');
            assert.strictEqual(source.path, 'in/fakeSource/filePath/source.png');
            assert.ok(nock.isDone());
        });

        it('paramsSource object will use url over mime type (as `type`) to determine extension', async () => {
            const paramsSource = {
                url: 'https://example.com/photo/elephant.png',
                type: 'image/jpeg',
                size: 11
            };
            const inDirectory = './in/fakeSource/filePath';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(inDirectory));

            nock('https://example.com')
                .get('/photo/elephant.png')
                .reply(200, 'hello world', {
                    'content-type': 'image/png',
                    'content-length': 11
                });

            const source = await Storage.getSource(paramsSource, inDirectory);

            assert.strictEqual(source.name, 'source.png');
            assert.strictEqual(source.path, 'in/fakeSource/filePath/source.png');
            assert.ok(nock.isDone());
        });
        it('paramsSource object will use url over mime type (as `mimetype`) to determine extension', async () => {
            const paramsSource = {
                url: 'https://example.com/photo/elephant.png',
                mimetype: 'image/jpeg',
                size: 11
            };
            const inDirectory = './in/fakeSource/filePath';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(inDirectory));

            nock('https://example.com')
                .get('/photo/elephant.png')
                .reply(200, 'hello world', {
                    'content-type': 'image/png',
                    'content-length': 11
                });

            const source = await Storage.getSource(paramsSource, inDirectory);

            assert.strictEqual(source.name, 'source.png');
            assert.strictEqual(source.path, 'in/fakeSource/filePath/source.png');
            assert.ok(nock.isDone());
        });

        it('paramsSource object will use url over mime type (as `mimeType` case sensitive) to determine extension', async () => {
            const paramsSource = {
                url: 'https://example.com/photo/elephant.png',
                mimeType: 'image/jpeg',
                size: 11
            };
            const inDirectory = './in/fakeSource/filePath';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(inDirectory));

            nock('https://example.com')
                .get('/photo/elephant.png')
                .reply(200, 'hello world', {
                    'content-type': 'image/png',
                    'content-length': 11
                });

            const source = await Storage.getSource(paramsSource, inDirectory);

            assert.strictEqual(source.name, 'source.png');
            assert.strictEqual(source.path, 'in/fakeSource/filePath/source.png');
            assert.ok(nock.isDone());
        });

        it('paramsSource object will use mime type (as `type`) over url to determine extension if source name is defined', async () => {
            const paramsSource = {
                url: 'https://example.com/photo/elephant.png',
                type: 'image/jpeg',
                name: 'file',
                size: 11
            };
            const inDirectory = './in/fakeSource/filePath';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(inDirectory));

            nock('https://example.com')
                .get('/photo/elephant.png')
                .reply(200, 'hello world', {
                    'content-type': 'image/png',
                    'content-length': 11
                });

            const source = await Storage.getSource(paramsSource, inDirectory);

            assert.strictEqual(source.name, 'source.jpeg');
            assert.strictEqual(source.path, 'in/fakeSource/filePath/source.jpeg');
            assert.ok(nock.isDone());
        });

        it('paramsSource object will use mime type (as `mimetype`) over url to determine extension if source name is defined', async () => {
            const paramsSource = {
                url: 'https://example.com/photo/elephant.png',
                mimetype: 'image/jpeg',
                name: 'file',
                size: 11
            };
            const inDirectory = './in/fakeSource/filePath';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(inDirectory));

            nock('https://example.com')
                .get('/photo/elephant.png')
                .reply(200, 'hello world', {
                    'content-type': 'image/png',
                    'content-length': 11
                });

            const source = await Storage.getSource(paramsSource, inDirectory);

            assert.strictEqual(source.name, 'source.jpeg');
            assert.strictEqual(source.path, 'in/fakeSource/filePath/source.jpeg');
            assert.ok(nock.isDone());
        });

        it('paramsSource object will use mime type (as `mimeType` case sensitive) over url to determine extension if source name is defined', async () => {
            const paramsSource = {
                url: 'https://example.com/photo/elephant.png',
                mimeType: 'image/jpeg',
                name: 'file',
                size: 11
            };
            const inDirectory = './in/fakeSource/filePath';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(inDirectory));

            nock('https://example.com')
                .get('/photo/elephant.png')
                .reply(200, 'hello world', {
                    'content-type': 'image/png',
                    'content-length': 11
                });

            const source = await Storage.getSource(paramsSource, inDirectory);

            assert.strictEqual(source.name, 'source.jpeg');
            assert.strictEqual(source.path, 'in/fakeSource/filePath/source.jpeg');
            assert.ok(nock.isDone());
        });

        it('paramsSource object will not fail if invalid mimetype (as `mimetype`)', async () => {
            const paramsSource = {
                url: 'https://example.com/photo/elephant.jpeg',
                mimetype: 'not a valid mimetype',
                name: 'file',
                size: 11
            };
            const inDirectory = './in/fakeSource/filePath';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(inDirectory));

            nock('https://example.com')
                .get('/photo/elephant.jpeg')
                .reply(200, 'hello world', {
                    'content-type': 'image/png',
                    'content-length': 11
                });

            const source = await Storage.getSource(paramsSource, inDirectory);

            assert.strictEqual(source.name, 'source');
            assert.strictEqual(source.path, 'in/fakeSource/filePath/source');
            assert.ok(nock.isDone());
        });

        it('paramsSource object will not fail if invalid mimetype (as `mimeType` case sensitive)', async () => {
            const paramsSource = {
                url: 'https://example.com/photo/elephant.jpeg',
                mimeType: 'not a valid mimetype',
                name: 'file',
                size: 11
            };
            const inDirectory = './in/fakeSource/filePath';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(inDirectory));

            nock('https://example.com')
                .get('/photo/elephant.jpeg')
                .reply(200, 'hello world', {
                    'content-type': 'image/png',
                    'content-length': 11
                });

            const source = await Storage.getSource(paramsSource, inDirectory);

            assert.strictEqual(source.name, 'source');
            assert.strictEqual(source.path, 'in/fakeSource/filePath/source');
            assert.ok(nock.isDone());
        });

        it('paramsSource object will take extension in name over mimetype (as `type`)', async () => {
            const paramsSource = {
                url: 'https://example.com/photo/elephant.jpeg',
                type: 'image/jpeg',
                name: 'file.png',
                size: 11
            };
            const inDirectory = './in/fakeSource/filePath';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(inDirectory));

            nock('https://example.com')
                .get('/photo/elephant.jpeg')
                .reply(200, 'hello world', {
                    'content-type': 'image/jpeg',
                    'content-length': 11
                });

            const source = await Storage.getSource(paramsSource, inDirectory);

            assert.strictEqual(source.name, 'source.png');
            assert.strictEqual(source.path, 'in/fakeSource/filePath/source.png');
            assert.ok(nock.isDone());
        });

        it('paramsSource object will take extension in name over mimetype (as `mimetype`)', async () => {
            const paramsSource = {
                url: 'https://example.com/photo/elephant.jpeg',
                mimetype: 'image/jpeg',
                name: 'file.png',
                size: 11
            };
            const inDirectory = './in/fakeSource/filePath';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(inDirectory));

            nock('https://example.com')
                .get('/photo/elephant.jpeg')
                .reply(200, 'hello world', {
                    'content-type': 'image/jpeg',
                    'content-length': 11
                });

            const source = await Storage.getSource(paramsSource, inDirectory);

            assert.strictEqual(source.name, 'source.png');
            assert.strictEqual(source.path, 'in/fakeSource/filePath/source.png');
            assert.ok(nock.isDone());
        });

        it('paramsSource object will take extension in name over mimetype (as `mimeType` case sensitive)', async () => {
            const paramsSource = {
                url: 'https://example.com/photo/elephant.jpeg',
                mimeType: 'image/jpeg',
                name: 'file.png',
                size: 11
            };
            const inDirectory = './in/fakeSource/filePath';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(inDirectory));

            nock('https://example.com')
                .get('/photo/elephant.jpeg')
                .reply(200, 'hello world', {
                    'content-type': 'image/jpeg',
                    'content-length': 11
                });

            const source = await Storage.getSource(paramsSource, inDirectory);

            assert.strictEqual(source.name, 'source.png');
            assert.strictEqual(source.path, 'in/fakeSource/filePath/source.png');
            assert.ok(nock.isDone());
        });
        it('paramsSource is a string, but will be turned into an object', async () => {
            const paramsSource = 'https://example.com/photo/elephant.png';
            const inDirectory = './in/fakeSource/filePath';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(inDirectory));

            nock('https://example.com')
                .head('/photo/elephant.png')
                .reply(200, 'OK', {
                    'content-type': 'image/png',
                    'content-length': 11
                });
            nock('https://example.com')
                .get('/photo/elephant.png')
                .reply(200, 'hello world', {
                    'content-type': 'image/png',
                    'content-length': 11
                });

            const source = await Storage.getSource(paramsSource, inDirectory);

            assert.strictEqual(source.name, 'source.png');
            assert.strictEqual(source.path, 'in/fakeSource/filePath/source.png');
            assert.ok(nock.isDone());
        });
        it('paramsSource is a string, but will be turned into an object in worker test mode', async () => {
            process.env.WORKER_TEST_MODE = true;
            const paramsSource = 'file.jpg';
            const inDirectory = '/in';

            mockFs({ '/in/file.jpg': 'yo' });

            const source = await Storage.getSource(paramsSource, inDirectory);

            assert.strictEqual(source.name, 'file.jpg'); // in this case source name is actual file path
            assert.strictEqual(source.path, '/in/file.jpg');
        });
    });

    describe('putRendition', () => {

        beforeEach(() => {
            mockFs();
        });

        afterEach( () => {
            nock.cleanAll();
            mockFs.restore();
            delete process.env.WORKER_TEST_MODE;
            delete process.env.ASSET_COMPUTE_DISABLE_RETRIES;
        });

        it('should upload simple rendition', async () => {
            mockFs({ "./storeFiles/jpg": {
                "fakeEarth.jpg": "hello world!"
            } });
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            const rendition = {
                path: file,
                target: "https://example.com/fakeEarth.jpg",
                size: () => 1,
                contentType: () => { return "image/jpeg"; },
                shouldEmbedInIOEvent: () => { return false; }
            };

            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(200);

            assert.ok(fs.existsSync(file));
            await Storage.putRendition(rendition);
            assert.ok(nock.isDone());

        });

        it('should upload simple rendition (not in test mode)', async () => {
            delete process.env.WORKER_TEST_MODE;

            mockFs({ "./storeFiles/jpg": {
                "fakeEarth.jpg": "hello world!"
            } });
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            const rendition = {
                path: file,
                target: "https://example.com/fakeEarth.jpg",
                size: () => 1,
                contentType: () => { return "image/jpeg"; },
                shouldEmbedInIOEvent: () => { return false; }
            };

            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(200);

            assert.ok(fs.existsSync(file));
            await Storage.putRendition(rendition);
            assert.ok(nock.isDone());
        });

        it('should copy simple rendition, but not upload (in test mode)', async () => {
            process.env.WORKER_TEST_MODE = true;

            mockFs({
                "./storeFiles/jpg": {
                    "fakeEarth.jpg": "hello world!"
                }
            });
            const file = "./storeFiles/jpg/fakeEarth.jpg";
            const requestedFile = "./storeFiles/jpg/rendition.jpg";

            const rendition = {
                name: "simple-rendition.png",
                directory: "./storeFiles/jpg",
                path: file,
                target: "https://example.com/fakeEarth.jpg",
                instructions: { name: path.basename(requestedFile) }
            };

            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(200);

            assert.ok(fs.existsSync(file));
            await Storage.putRendition(rendition, {});
            assert.ok(fs.existsSync(file));
            assert.ok(fs.existsSync(requestedFile));
            assert.ok(! nock.isDone());
        });

        it('should embed small rendition, but not upload', async () => {
            mockFs({
                "./storeFiles/jpg": {
                    "fakeEarth.jpg": "hello world!"
                }
            });
            const file = "./storeFiles/jpg/fakeEarth.jpg";
            const requestedFile = "./storeFiles/jpg/rendition.jpg";

            const rendition = {
                directory: "./storeFiles/jpg",
                path: file,
                target: "https://example.com/fakeEarth.jpg",
                instructions: {
                    name: path.basename(requestedFile),
                    embedBinaryLimit: EMBED_LIMIT_MAX
                },
                size: () => 1,
                contentType: () => { return "image/jpeg"; },
                shouldEmbedInIOEvent: () => { return true; },
            };


            assert.ok(fs.existsSync(file));
            await Storage.putRendition(rendition);
            assert.ok(fs.existsSync(file));
        });
    });
});
