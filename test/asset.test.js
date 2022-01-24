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

const Asset = require('../lib/asset');

describe("asset.js", () => {
    it('verifies constructor works properly', function () {
        let asset = new Asset({}, '', 'file.png');
        assert.ok(asset instanceof Asset);
        assert.ok(asset.path, "./file.png");
        assert.ok(asset.name, 'file.png');
        assert.ok(asset.extension, 'png');
        assert.strictEqual(asset.url, undefined);
        assert.strictEqual(asset.size, undefined);
        assert.strictEqual(asset.headers, undefined);
        assert.strictEqual(asset.type, undefined);

        // custom directory
        asset = new Asset({}, '/path', 'file.png');
        assert.ok(asset instanceof Asset);
        assert.ok(asset.path, "/path/file.png");
        assert.ok(asset.name, 'file.png');
        assert.ok(asset.extension, 'png');
        
        // no extension
        asset = new Asset({}, '/path', 'file');
        assert.ok(asset instanceof Asset);
        assert.ok(asset.path, "/path/file");
        assert.ok(asset.name, 'file');
        assert.ok(asset.extension, '');
    });

    it('verifies constructor works properly without params', function () {
        const asset = new Asset();
        assert.ok(asset instanceof Asset);
        assert.strictEqual(asset.path, '.');
        assert.strictEqual(asset.name, '');
        assert.strictEqual(asset.extension, '');
        assert.strictEqual(asset.url, undefined);
        assert.strictEqual(asset.size, undefined);
        assert.strictEqual(asset.headers, undefined);
        assert.strictEqual(asset.type, undefined);
    });

    it('verifies constructor works properly with all the asset params', function () {
        const assetParams = {
            type: 'image/jpeg',
            url: 'https://adobe.com',
            headers: {
                'content-type': 'image/png'
            },
            size: 123456
        };
        const asset = new Asset(assetParams, '', 'file.jpeg');
        assert.ok(asset instanceof Asset);
        assert.strictEqual(asset.path, 'file.jpeg');
        assert.strictEqual(asset.name, 'file.jpeg');
        assert.strictEqual(asset.extension, 'jpeg');
        assert.strictEqual(asset.url, assetParams.url);
        assert.strictEqual(asset.size, assetParams.size);
        assert.strictEqual(asset.headers, assetParams.headers);
        assert.strictEqual(asset.type, assetParams.type);
    });

    it('verifies mimetype is mapped to type', function () {
        const assetParams = {
            mimetype: 'image/jpeg'
        };
        const asset = new Asset(assetParams, '', 'file.jpeg');
        assert.ok(asset instanceof Asset);
        assert.strictEqual(asset.path, 'file.jpeg');
        assert.strictEqual(asset.name, 'file.jpeg');
        assert.strictEqual(asset.extension, 'jpeg');
        assert.strictEqual(asset.type, assetParams.mimetype);
    });

    it('verifies mimeType is mapped to type (mimeType variable name is case sensitive)', function () {
        const assetParams = {
            mimeType: 'image/jpeg'
        };
        const asset = new Asset(assetParams, '', 'file.jpeg');
        assert.ok(asset instanceof Asset);
        assert.strictEqual(asset.path, 'file.jpeg');
        assert.strictEqual(asset.name, 'file.jpeg');
        assert.strictEqual(asset.extension, 'jpeg');
        assert.strictEqual(asset.type, assetParams.mimeType);
    });

});
