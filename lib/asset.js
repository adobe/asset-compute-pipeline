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

'use strict';
const path = require('path');

// TODO: create a super class for Asset and Rendition
// TODO: keep backwards compatibility with the SDK
class Asset {
    constructor(assetParams, directory="", name="") {
        this.params = assetParams;
        this.name = name;
        this.path = path.join(directory, this.name);
    }

    get extension() {
        return this.path.split(".").pop();
    }

    get type() {
        // to stay backwards compatible, map `mimeType` or `mimetype` to `type`
        return this.params ? (this.params.type || this.params.mimeType || this.params.mimetype) : undefined;
    }

    get url() {
        return this.params ? this.params.url : undefined;
    }

    get headers() {
        return this.params ? this.params.headers : undefined;
    }
    get size() {
        return this.params ? this.params.size : undefined;
    }
}

module.exports = Asset;