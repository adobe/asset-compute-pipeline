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
const { download } = require('../../lib/storage/datauri');
const { TemporaryCloudStorage } = require('./mock-temporary-cloud-storage');
const proxyquire = require('proxyquire');
const nock = require('nock');

describe('datauri.js', () => {

    beforeEach( () => {
        mockFs();
        process.env.__OW_ACTION_NAME = 'test_action';
    });
    afterEach( () => {
        nock.cleanAll();
        mockFs.restore();
        delete process.env.__OW_ACTION_NAME;
    });

    it("should download data uri", async() => {
        const source = {
            url: "data:text/plain;base64,SGVsbG8sIFdvcmxkIQ%3D%3D",
            name: "inlineData.txt"
        };

        mockFs({ './storeFiles/txt': {} });
        const file = "./storeFiles/txt/inlineData.txt";

        await download(source, file);
        assert.ok(fs.existsSync(file));
        assert.strictEqual(fs.readFileSync(file).toString(), 'Hello, World!');
        assert.ok(nock.isDone());
    });

    it("should fail download data uri on fs error", async() => {
        const source = {
            url: "data:text/plain;base64,SGVsbG8sIFdvcmxkIQ%3D%3D",
            name: "inlineData.txt"
        };

        const file = "./storeFiles/txt/inlineData.txt";

        try {
            await download(source, file);
        } catch (e) {
            assert.strictEqual(e.name, 'GenericError');
            assert.strictEqual(e.location, 'test_action_download');
        }
        assert.ok(!fs.existsSync(file));
        assert.ok(nock.isDone());
    });

    it("should generate preSignUrl", async() => {
        const source = {
            url: "data:text/plain;base64,SGVsbG8sIFdvcmxkIQ%3D%3D",
            name: "inlineData.txt",
            path: "fakeSuccessFilePath"
        };
        mockFs.restore();
        const datauri = proxyquire('../../lib/storage/datauri', {
            './temporary-cloud-storage.js':  {TemporaryCloudStorage}
        });
        const preSignedUrl = await datauri.getPreSignedUrl(source.path);
        assert.strictEqual(preSignedUrl,`http://storage.com/preSignUrl/${source.path}`);
    });

    it("should retry preSignUrl generation on failures", async() => {
        const source = {
            url: "data:text/plain;base64,SGVsbG8sIFdvcmxkIQ%3D%3D",
            name: "inlineData.txt",
            path: "fakeRetrySuccessFilePath"
        };
        mockFs.restore();
        const datauri = proxyquire('../../lib/storage/datauri', {
            './temporary-cloud-storage.js':  {TemporaryCloudStorage}
        });
        const preSignedUrl = await datauri.getPreSignedUrl(source.path);
        assert.strictEqual(preSignedUrl,`http://storage.com/preSignUrl/${source.path}`);
    });

    it("should throw Generic Error if presigned url generation failed after retries", async() => {
        const source = {
            url: "data:text/plain;base64,SGVsbG8sIFdvcmxkIQ%3D%3D",
            name: "inlineData.txt",
            path: "fakeFailureFilePath"
        };
        mockFs.restore();
        const datauri = proxyquire('../../lib/storage/datauri', {
            './temporary-cloud-storage.js':  {TemporaryCloudStorage}
        });
        try{
            await datauri.getPreSignedUrl(source.path, 0);
        }catch(e){
            assert.strictEqual(e.name, 'GenericError');
            assert.strictEqual(e.message, `Failed to generate PresignedUrl for ${source.path}`);
        }
    });



});
