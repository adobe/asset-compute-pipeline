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

const oldDownloadFileHttpTransfer = http.downloadFile;

describe('http.js', () => {

    beforeEach( () => {
        mockFs();
        process.env.__OW_ACTION_NAME = 'test_action';
    });
    afterEach( () => {
        http.downloadFile = oldDownloadFileHttpTransfer;
        nock.cleanAll();
        mockFs.restore();
        delete process.env.__OW_ACTION_NAME;
        delete process.env.ASSET_COMPUTE_DISABLE_RETRIES;
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

    });
});
