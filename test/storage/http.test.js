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

const assert = require('assert');
const mockFs = require("mock-fs");
const fs = require('fs-extra');
const { download, upload } = require('../../lib/storage/http');
const Asset = require('../../lib/asset');
const nock = require('nock');
const http = require('@adobe/httptransfer');
const proxyquire =  require('proxyquire');
const rewire = require('rewire');

const rewiredHttp = rewire('../../lib/storage/http');
const getMaxConcurrent = rewiredHttp.__get__('getMaxConcurrent');


const oldDownloadFileHttpTransfer = http.downloadFileConcurrently;

const DEFAULT_MAX_CONCURRENT = 8;
const DEFAULT_PREFERRED_PART_SIZE = 100 * 1024 * 1024; // Default part size is 10mb

describe('http.js', () => {

    beforeEach( () => {
        process.env.__OW_ACTION_NAME = 'test_action';
    });
    afterEach( () => {
        // TODO: switch tests that are using this to proxyquire
        http.downloadFileConcurrently = oldDownloadFileHttpTransfer;
        nock.cleanAll();
        // mockFs messes with rewire and proxyquire loading in of modules
        // we must make sure to restore mockFs before using these modules
        mockFs.restore();
        delete process.env.__OW_ACTION_NAME;
        delete process.env.ASSET_COMPUTE_DISABLE_RETRIES;
    });

    describe('getMaxConcurrent', () => {
        it("no containerMemorySize available, use default concurrency",  async () => {
            const maxConcurrent = await getMaxConcurrent(DEFAULT_PREFERRED_PART_SIZE);
            assert.strictEqual(maxConcurrent, DEFAULT_MAX_CONCURRENT);
        });
        it("containerMemorySize is missing or malformated, use default concurrency",  async () => {
            mockFs({ '/sys/fs/cgroup/memory/memory.limit_in_bytes': 'not a valid number' });
            const maxConcurrent = await getMaxConcurrent(DEFAULT_PREFERRED_PART_SIZE);
            assert.strictEqual(maxConcurrent, DEFAULT_MAX_CONCURRENT);
        });
        it("containerMemorySize is 40gb, use default concurrency",  async () => {
            // this is the container memory size for worker-pie-large
            // although there is a lot of memory available and we could use higher concurrency,
            // we still use the default concurrency
            const containerMemorySizeInBytes = '41943040000'; // 1gb
            mockFs({ '/sys/fs/cgroup/memory/memory.limit_in_bytes': containerMemorySizeInBytes });
            const maxConcurrent = await getMaxConcurrent(DEFAULT_PREFERRED_PART_SIZE);
            assert.strictEqual(maxConcurrent, DEFAULT_MAX_CONCURRENT);
        });
        it("containerMemorySize is 2gb, use default concurrency",  async () => {
            // this is the container memory size for a lot of our workers
            const containerMemorySizeInBytes = '2147483648'; // 1gb
            mockFs({ '/sys/fs/cgroup/memory/memory.limit_in_bytes': containerMemorySizeInBytes });
            const maxConcurrent = await getMaxConcurrent(DEFAULT_PREFERRED_PART_SIZE);
            assert.strictEqual(maxConcurrent, DEFAULT_MAX_CONCURRENT);
        });
        it("containerMemorySize is 1024mb, use default concurrency",  async () => {
            // this is the container memory size for a lot of our workers
            const containerMemorySizeInBytes = '1073741824'; // 1gb
            mockFs({ '/sys/fs/cgroup/memory/memory.limit_in_bytes': containerMemorySizeInBytes });
            const maxConcurrent = await getMaxConcurrent(DEFAULT_PREFERRED_PART_SIZE);
            assert.strictEqual(maxConcurrent, DEFAULT_MAX_CONCURRENT);
        });
        it("containerMemorySize is just big enough, use default concurrency",  async () => {
            const containerMemorySizeInBytes = '10066329601'; // 1gb
            mockFs({ '/sys/fs/cgroup/memory/memory.limit_in_bytes': containerMemorySizeInBytes });
            const maxConcurrent = await getMaxConcurrent(DEFAULT_PREFERRED_PART_SIZE);
            assert.strictEqual(maxConcurrent, 8);
        });
        it("containerMemorySize is 1 byte too small, adjust concurrency down",  async () => {
            const containerMemorySizeInBytes = '1006632960'; // 1gb
            mockFs({ '/sys/fs/cgroup/memory/memory.limit_in_bytes': containerMemorySizeInBytes });
            const maxConcurrent = await getMaxConcurrent(DEFAULT_PREFERRED_PART_SIZE);
            assert.strictEqual(maxConcurrent, 7);
        });
        it("containerMemorySize is 512mb, adjust concurrency down",  async () => {
            // worker-dcx, worker-transfer, worker-zip, worker-indesign fall into this category
            const containerMemorySizeInBytes = '536870912'; // 1gb
            mockFs({ '/sys/fs/cgroup/memory/memory.limit_in_bytes': containerMemorySizeInBytes });
            const maxConcurrent = await getMaxConcurrent(DEFAULT_PREFERRED_PART_SIZE);
            assert.strictEqual(maxConcurrent, 4);
        });
        it("containerMemorySize is 256mb, adjust concurrency down",  async () => {
            // this is the default for IO runtime actions
            // custom workers as well as core have this amount
            const containerMemorySizeInBytes = '268435456'; // 1gb
            mockFs({ '/sys/fs/cgroup/memory/memory.limit_in_bytes': containerMemorySizeInBytes });
            const maxConcurrent = await getMaxConcurrent(DEFAULT_PREFERRED_PART_SIZE);
            assert.strictEqual(maxConcurrent, 2);
        });
        it("containerMemorySize is 256mb but preferred part size is 10mb, so default concurrency is chosen",  async () => {
            // this is the default for IO runtime actions
            // custom workers as well as core have this amount
            const containerMemorySizeInBytes = '268435456'; // 1gb
            mockFs({ '/sys/fs/cgroup/memory/memory.limit_in_bytes': containerMemorySizeInBytes });
            const maxConcurrent = await getMaxConcurrent(10 * 1024 * 1024);
            assert.strictEqual(maxConcurrent, 8);
        });
    });

    describe('download', () => {

        it("should download jpg file (skip head request, source.type is a valid mimetype)", async () => {
            // source.type
            const source = {
                url: "https://example.com/fakeEarth.jpg",
                name: "fakeEarth.jpg",
                size: 11,
                type: 'image/jpeg'
            };

            mockFs({ './storeFiles/jpg': {} });

            nock("https://example.com")
                .get("/fakeEarth.jpg")
                .reply(200, "hello world", {
                    'content-type': 'image/jpeg',
                    'content-length': 11
                });

            const file = './storeFiles/jpg/fakeEarth.jpg';

            await download( source, file);
            assert.ok(fs.existsSync(file));
            assert.ok(nock.isDone());
        });
        it("should download jpg file (skip head request, source.mimetype is a valid mimetype)", async () => {
            // source.mimetype
            const source = new Asset({
                url: "https://example.com/fakeEarth.jpg",
                name: "fakeEarth.jpg",
                size: 11,
                mimetype: 'image/jpeg'
            });

            mockFs({ './storeFiles/jpg': {} });

            nock("https://example.com")
                .get("/fakeEarth.jpg")
                .reply(200, "hello world", {
                    'content-type': 'image/jpeg',
                    'content-length': 11
                });

            const file = './storeFiles/jpg/fakeEarth.jpg';

            await download( source, file);
            assert.ok(fs.existsSync(file));
            assert.ok(nock.isDone());
        });
        it("should download jpg file (skip head request, source.mimeType is a valid mimetype)", async () => {
            // source.mimetype
            const source = new Asset({
                url: "https://example.com/fakeEarth.jpg",
                name: "fakeEarth.jpg",
                size: 11,
                mimeType: 'image/jpeg'
            });

            mockFs({ './storeFiles/jpg': {} });

            nock("https://example.com")
                .get("/fakeEarth.jpg")
                .reply(200, "hello world", {
                    'content-type': 'image/jpeg',
                    'content-length': 11
                });

            const file = './storeFiles/jpg/fakeEarth.jpg';

            await download( source, file);
            assert.ok(fs.existsSync(file));
            assert.ok(nock.isDone());
        });
        it("should download jpg file (with head request)", async () => {
            const source = {
                url: "https://example.com/fakeEarth.jpg",
                name: "fakeEarth.jpg"
            };

            mockFs({ './storeFiles/jpg': {} });

            nock("https://example.com")
                .head("/fakeEarth.jpg")
                .reply(200, "OK", {
                    'content-type': 'image/jpeg',
                    'content-length': 11
                });
            nock("https://example.com")
                .get("/fakeEarth.jpg")
                .reply(200, "hello world", {
                    'content-type': 'image/jpeg',
                    'content-length': 11
                });

            const file = './storeFiles/jpg/fakeEarth.jpg';

            await download( source, file);
            assert.ok(fs.existsSync(file));
            assert.ok(nock.isDone());
        });


        it("should fail downloading a jpg file mocking @adobe/httptransfer", async () => {
            const source = {
                url: "https://example.com/fakeEarth.jpg"
            };
            mockFs({ './storeFiles/jpg': {} });
            const oldDownloadFileConcurrently = http.downloadFileConcurrently;
            http.downloadFileConcurrently = function() {
                throw new Error('ERRRR. GET \'https://example.com/fakeEarth.jpg\' failed with status 404.');
            };
            const file = './storeFiles/jpg/fakeEarth.jpg';
            try {
                await download(source, file);
            } catch (e) {
                assert.strictEqual(e.name, 'GenericError');
                assert.strictEqual(e.message, 'ERRRR. GET \'https://example.com/fakeEarth.jpg\' failed with status 404.');
                assert.strictEqual(e.location, 'test_action_download');
            }
            assert.ok(! fs.existsSync(file));
            http.downloadFileConcurrently = oldDownloadFileConcurrently;
        });

        it("should fail downloading a jpg file", async () => {
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            assert.ok(! fs.existsSync(file));
            const source = {
                url: "https://example.com/fakeEarth.jpg",
                name: 'fakeEarth.jpg',
                size: 11,
                type: 'image/jpeg'
            };
            mockFs({ "./storeFiles/jpg": {} });

            nock("https://example.com")
                .get("/fakeEarth.jpg")
                .reply(404, "error");

            try {
                await download(source, file);
                assert.fail('should have failed');
            } catch (e) {
                assert.strictEqual(e.name, "GenericError");
                assert.strictEqual(e.message, "GET 'https://example.com/fakeEarth.jpg' failed with status 404");
                assert.strictEqual(e.location, "test_action_download");
            }
            assert.ok(!fs.existsSync(file)); // should error before creating streams
        });

        it("should fail downloading once before succeeding", async () => {
            const source = { 
                url: "https://example.com/fakeEarth.jpg",
                size: 11,
                type: 'image/jpeg'
            };

            mockFs({ './storeFiles/jpg': {} });

            const file = './storeFiles/jpg/fakeEarth.jpg';

            nock("https://example.com")
                .get("/fakeEarth.jpg")
                .reply(504, "error");
            nock("https://example.com")
                .get("/fakeEarth.jpg")
                .reply(200, "hello world", {
                    'content-type': 'image/jpeg',
                    'content-length': 11
                });

            process.env.__OW_DEADLINE = Date.now() + 1000;
            await download(source, file);
            assert.ok(nock.isDone());
            assert.ok(fs.existsSync(file));
        });
        it("should download jpg file with default preferred part size and concurrency (mocked httptransfer)", async () => {
            // mockFs messes with proxyquire and rewire loading files
            // must restore mockFs before using these libraries
            mockFs.restore();
            // source.type
            const source = {
                url: "https://example.com/fakeEarth.jpg",
                name: "fakeEarth.jpg",
                size: DEFAULT_PREFERRED_PART_SIZE,
                type: 'image/jpeg'
            };
            const file = './storeFiles/jpg/fakeEarth.jpg';
            const { download } = proxyquire('../../lib/storage/http.js', {
                '@adobe/httptransfer':  {
                    downloadFileConcurrently: async function(url, filepath, options) {
                        assert.strictEqual(url, source.url);
                        assert.strictEqual(filepath, './storeFiles/jpg/fakeEarth.jpg');
                        assert.strictEqual(options.maxConcurrent, DEFAULT_MAX_CONCURRENT);
                        assert.strictEqual(options.preferredPartSize, DEFAULT_PREFERRED_PART_SIZE);
                        const str = '#'.repeat(DEFAULT_PREFERRED_PART_SIZE);
                        fs.writeFileSync(file, str);
                    }
                }
            });

            const containerMemorySizeInBytes = '1073741824'; // 1gb

            mockFs({ 
                './storeFiles/jpg': {},
                '/sys/fs/cgroup/memory/memory.limit_in_bytes': containerMemorySizeInBytes
            });

            await download( source, file);
            assert.ok(fs.existsSync(file));
        });
        it("should download jpg file with default preferred part size and decreased concurrency (mocked httptransfer)", async () => {
            // mockFs messes with proxyquire and rewire loading files
            // must restore mockFs before using these libraries
            mockFs.restore();

            // source.type
            const source = {
                url: "https://example.com/fakeEarth.jpg",
                name: "fakeEarth.jpg",
                size: 11,
                type: 'image/jpeg'
            };
            const file = './storeFiles/jpg/fakeEarth.jpg';
            const { download } = proxyquire('../../lib/storage/http.js', {
                '@adobe/httptransfer':  {
                    downloadFileConcurrently: async function(url, filepath, options) {
                        assert.strictEqual(url, source.url);
                        assert.strictEqual(filepath, './storeFiles/jpg/fakeEarth.jpg');
                        assert.strictEqual(options.maxConcurrent, 4);
                        assert.strictEqual(options.preferredPartSize, DEFAULT_PREFERRED_PART_SIZE);
                        fs.writeFileSync(file, 'hello world');
                    }
                }
            });
            
            const containerMemorySizeInBytes = '536870912'; // 512mb
            mockFs({
                './storeFiles/jpg': {},
                '/sys/fs/cgroup/memory/memory.limit_in_bytes': containerMemorySizeInBytes
            });

            await download( source, file);
            assert.ok(fs.existsSync(file));
        });
    });
    describe('upload', () => {

        it("should upload one rendition successfully", async () => {
            mockFs({ "./storeFiles/jpg": {
                "fakeEarth.jpg": "hello world!"
            } });
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            const rendition = {
                path: file,
                target: "https://example.com/fakeEarth.jpg",
                name: 'fakeEarth.jpg',
                size: () => 1,
                contentType: async () => "image/jpeg"
            };

            nock("https://example.com")
                .matchHeader('content-type', 'image/jpeg')
                .put("/fakeEarth.jpg", "hello world!")
                .reply(200);

            assert.ok(fs.existsSync(file));
            await upload(rendition);
            assert.ok(nock.isDone());
        });

        it("should fail uploading a rendition with 504", async () => {
            process.env.ASSET_COMPUTE_DISABLE_RETRIES = true; // disable retries to test upload failure
            mockFs({ "./storeFiles/jpg": {
                "fakeEarth.jpg": "hello world!"
            } });
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            const rendition = {
                path: file,
                target: "https://example.com/fakeEarth.jpg",
                size: () => 1,
                contentType: () => "application/octet-stream"
            };

            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .replyWithError(504);

            assert.ok(fs.existsSync(file));
            try {
                await upload(rendition);
            } catch (e) {
                assert.strictEqual(e.name, "GenericError");
                assert.ok(e.message.includes("failed: request to https://example.com/fakeEarth.jpg failed, reason: 504"));
                assert.strictEqual(e.location, "test_action_upload");
            }
            assert.ok(nock.isDone());
        });

        it("should fail uploading once before succeeding", async () => {
            mockFs({ "./storeFiles/jpg": {
                "fakeEarth.jpg": "hello world!"
            } });
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            const rendition = {
                path: file,
                target: "https://example.com/fakeEarth.jpg",
                size: () => 1,
                contentType: () => "application/octet-stream"
            };
            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(503, "error");
            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(200, "ok");

            assert.ok(fs.existsSync(file));
            await upload(rendition);
            assert.ok(nock.isDone());
        });


        it("should fail uploading a rendition with 404", async () => {
            process.env.ASSET_COMPUTE_DISABLE_RETRIES = true; // disable retries to test upload failure
            mockFs({ "./storeFiles/jpg": {
                "fakeEarth.jpg": "hello world!"
            } });
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            const rendition = {
                path: file,
                target: "https://example.com/fakeEarth.jpg",
                size: () => 1,
                contentType: () => "application/octet-stream"
            };

            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(404, "error");

            assert.ok(fs.existsSync(file));
            try {
                await upload(rendition);
            } catch (e) {
                assert.strictEqual(e.name, "GenericError");
                assert.strictEqual(e.message, "PUT 'https://example.com/fakeEarth.jpg' failed with status 404");
                assert.strictEqual(e.location, "test_action_upload");
            }
            assert.ok(nock.isDone());
        });

        it("should not fail when trying to update a rendition with no file path", async () => {
            mockFs({ "./storeFiles/jpg": {
                "fakeEarth.jpg": "hello world!"
            } });
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(200);

            const rendition = {
                id: () => { return '1234';},
                target: "https://example.com/fakeEarth.jpg"
            };


            assert.ok(fs.existsSync(file));
            try {
                await upload(rendition);
                assert.fail('Should have failed during upload');
            } catch (e) {
                assert.strictEqual(e.name, 'GenericError');
                assert.strictEqual(e.message, 'rendition 1234 does not have a file path: undefined');
                assert.strictEqual(e.location, 'test_action_upload');
            }
            assert.ok( ! nock.isDone());
        });

        it("should not fail when trying to update a rendition with no target", async () => {
            mockFs({ "./storeFiles/jpg": {
                "fakeEarth.jpg": "hello world!"
            } });
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            const rendition = {
                id: () => { return '1234';},
                path: file
            };

            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(200);

            assert.ok(fs.existsSync(file));
            await upload(rendition);
            assert.ok(! nock.isDone());
        });

        it("should upload jpg file with default preferred part size and concurrency (mocked httptransfer)", async () => {
            // mockFs messes with proxyquire and rewire loading files
            // must restore mockFs before using these libraries
            mockFs.restore();
            const file = "./storeFiles/jpg/fakeEarth.jpg";
            const rendition = {
                path: file,
                target: "https://example.com/fakeEarth.jpg",
                name: 'fakeEarth.jpg',
                size: () => 1,
                contentType: async () => "image/jpeg"
            };
            const { upload } = proxyquire('../../lib/storage/http.js', {
                '@adobe/httptransfer':  {
                    uploadFileConcurrently: async function(filepath, target, options) {
                        assert.strictEqual(filepath, file);
                        assert.strictEqual(target, "https://example.com/fakeEarth.jpg");
                        assert.strictEqual(options.maxConcurrent, DEFAULT_MAX_CONCURRENT);
                        assert.strictEqual(options.preferredPartSize, DEFAULT_PREFERRED_PART_SIZE);
                        assert.ok(fs.existsSync(filepath));
                    }
                }
            });

            const containerMemorySizeInBytes = '1073741824'; // 1gb

            mockFs({ 
                './storeFiles/jpg': {
                    "fakeEarth.jpg": "hello world!"
                },
                '/sys/fs/cgroup/memory/memory.limit_in_bytes': containerMemorySizeInBytes
            });

            assert.ok(fs.existsSync(file));
            await upload(rendition);
        });
        it("should upload jpg file with default preferred part size and decreased concurrency (mocked httptransfer)", async () => {
            // mockFs messes with proxyquire and rewire loading files
            // must restore mockFs before using these libraries
            mockFs.restore();
            const file = "./storeFiles/jpg/fakeEarth.jpg";
            const rendition = {
                path: file,
                target: "https://example.com/fakeEarth.jpg",
                name: 'fakeEarth.jpg',
                size: () => 1,
                contentType: async () => "image/jpeg"
            };
            const { upload } = proxyquire('../../lib/storage/http.js', {
                '@adobe/httptransfer':  {
                    uploadFileConcurrently: async function(filepath, target, options) {
                        assert.strictEqual(filepath, file);
                        assert.strictEqual(target, "https://example.com/fakeEarth.jpg");
                        assert.strictEqual(options.maxConcurrent, 4);
                        assert.strictEqual(options.preferredPartSize, DEFAULT_PREFERRED_PART_SIZE);
                        assert.ok(fs.existsSync(filepath));
                    }
                }
            });

            const containerMemorySizeInBytes = '536870912'; // 1gb

            mockFs({ 
                './storeFiles/jpg': {
                    "fakeEarth.jpg": "hello world!"
                },
                '/sys/fs/cgroup/memory/memory.limit_in_bytes': containerMemorySizeInBytes
            });

            assert.ok(fs.existsSync(file));
            await upload(rendition);
        });

    });
});
