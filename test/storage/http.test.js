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

const mockFs = require('mock-fs');
const fs = require('fs-extra');
const http = require('../../lib/sdk/storage/http');
const Engine = require('../../lib/engine');
const { Plan } = require('../../lib/plan');
const TestTransformers = require('../transformers/testTransformers');

const nock = require('nock');
const assert = require('assert');

const httpTransfer = require('@adobe/httptransfer');
const Rendition = require("../../lib/sdk/rendition");

const oldDownloadFileHttpTransfer = httpTransfer.downloadFile;

describe('http.js', () => {

    beforeEach( () => {
        mockFs();
        process.env.__OW_ACTION_NAME = 'test_action';
    });
    afterEach( () => {
        httpTransfer.downloadFile = oldDownloadFileHttpTransfer;
        nock.cleanAll();
        mockFs.restore();
        delete process.env.__OW_ACTION_NAME;
        delete process.env.ASSET_COMPUTE_DISABLE_RETRIES;
    });

    describe('download', () => {

        it("should download jpg file", async () => {
            const source = {
                url: "https://example.com/fakeEarth.jpg",
                name: "fakeEarth.jpg"
            };

            mockFs({ './storeFiles/jpg': {} });

            nock("https://example.com")
                .get("/fakeEarth.jpg")
                .reply(200, "ok");

            const file = './storeFiles/jpg/fakeEarth.jpg';

            await http.download( source, file);
            assert.ok(fs.existsSync(file));
            assert.ok(nock.isDone());
        });


        it("should fail downloading a jpg file mocking @adobe/httptransfer", async () => {
            const source = {
                url: "https://example.com/fakeEarth.jpg"
            };
            mockFs({ './storeFiles/jpg': {} });

            httpTransfer.downloadFile = function() {
                throw new Error('GET \'https://example.com/fakeEarth.jpg\' failed with status 404.');
            };
            const file = './storeFiles/jpg/fakeEarth.jpg';
            try {
                await http.download(source, file);
                assert.fail('Should have failed during download');
            } catch (e) {
                assert.strictEqual(e.name, 'GenericError');
                assert.strictEqual(e.message, 'GET \'https://example.com/fakeEarth.jpg\' failed with status 404.');
                assert.strictEqual(e.location, 'test_action_download');
            }
            assert.ok(! fs.existsSync(file));
        });

        it("should fail downloading a jpg file", async () => {
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            assert.ok(! fs.existsSync(file));
            const source = {
                url: "https://example.com/fakeEarth.jpg",
                name: 'fakeEarth.jpg'
            };
            mockFs({ "./storeFiles/jpg": {} });

            nock("https://example.com")
                .get("/fakeEarth.jpg")
                .reply(404, "error");

            try {
                await http.download(source, file);
                assert.fail('Should have failed during download');
            } catch (e) {
                assert.strictEqual(e.name, "GenericError");
                assert.strictEqual(e.message, "GET 'https://example.com/fakeEarth.jpg' failed with status 404");
                assert.strictEqual(e.location, "test_action_download");
            }
            assert.strictEqual(fs.statSync(file).size, 0); // should error on createReadStream
        });

        it("should fail downloading once before succeeding", async () => {
            const source = { url: "https://example.com/fakeEarth.jpg" };

            mockFs({ './storeFiles/jpg': {} });

            const file = './storeFiles/jpg/fakeEarth.jpg';

            nock("https://example.com")
                .get("/fakeEarth.jpg")
                .reply(504, "error");
            nock("https://example.com")
                .get("/fakeEarth.jpg")
                .reply(200, "ok");

            process.env.__OW_DEADLINE = Date.now() + 1000;
            await http.download(source, file);
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
            await http.upload(rendition);
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
                await http.upload(rendition);
                assert.fail('Should have failed during upload');
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
            await http.upload(rendition);
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
                await http.upload(rendition);
                assert.fail('Should have failed during upload');
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
                await http.upload(rendition);
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
            await http.upload(rendition);
            assert.ok(! nock.isDone());
        });
    });

    describe('upload output renditions', () => {
        const domain = "http://www.notarealurl.com";
        let pipeline, plan, input, output, testMode, nockScope;

        beforeEach(() => {
            mockFs({
                "test.gif": "gif89a//********"
            });
            pipeline = new Engine();

            delete process.env.WORKER_TEST_MODE;

            pipeline.registerTransformer(new TestTransformers.CopyTransformer());

            input = {
                type: 'image/gif',
                path: 'test.gif'
            };
            output = {
                type: 'image/gif',
                path: 'test-out.gif'
            };
    
            plan = new Plan();

            nock.disableNetConnect();
            nockScope = nock(domain);
        });

        afterEach(() => {
            mockFs.restore();
            nock.cleanAll();
            nock.enableNetConnect();
            process.env.WORKER_TEST_MODE = testMode;
        });

        it("uploads files if URL is present.", async () => {
            const path = "/test.gif";
            nockScope.put(path).reply(200, true);
            output.target=domain + path;
            await pipeline.refinePlan(plan, input, output);
            await pipeline.run(plan);

            // check if file upload occurred
            assert.ok(nockScope.isDone(), "Should have posted file");
        });

        it("uploads files only once", async () => {
            const path = "/test.gif";
            nockScope.put(path).times(1).reply(200, true);
            output.target=domain + path;
            await pipeline.refinePlan(plan, input, output);
            const result = await pipeline.run(plan);

            assert.ok(nockScope.isDone(), "Should have posted file");

            // Should do nothing the second time, otherwise nock will throw error proving there is an issue.
            await http.uploadRenditionOnce(result.rendition);            
        });

        it("does not upload if href is not provided", async () => {
            const rendition = new Rendition({
                // No target, should not upload
                target: null
            });
            rendition.path="./not-a-file.txt";
            // Any attempt to try to start uploading will result in an error because there is no real file
            const uploaded = await http.uploadRenditionOnce(rendition);
            assert.strictEqual(uploaded, false, "Should return false when no target url provided");
        }, ".");

        it("does not upload renditions that should be embeded", async () => {
            const rendition = new Rendition({
                target: "http://www.nowhere.com/file.txt"
            });
            rendition.path="./not-a-file.txt";
            // This is the primary condition asserted in this test
            rendition.shouldEmbedInIOEvent = () => true;
            // Any attempt to try to start uploading will result in an error because there is no real file
            const uploaded = await http.uploadRenditionOnce(rendition);
            assert.strictEqual(uploaded, false, "Should return false when not uploaded");
        });
    });
});
