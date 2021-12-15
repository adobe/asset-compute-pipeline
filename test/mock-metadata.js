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

'use strict';

const Metadata = require('../lib/metadata');
const { GenericError } = require('@adobe/asset-compute-commons');

class MockMetadata extends Metadata {
    constructor(source) {
        console.log('Using Mocked Metadata');
        super(source);
    }

    async extract() {
        if (super.isVideo() || super.isTextTranscriptable()) {
            let input = super.source.url;
            if (!input && super.source.path) {
                input = super.source.path;
            }
            if (!input) {
                throw new GenericError(`Image source must contain either 'url' or 'path' field to retrieve metadata`);
            }
            super._metadata = { extracted: true };
        } else { // image asset
            if (!super.source.path) {
                throw new GenericError(`Image source must contain 'path' field to retrieve metadata`);
            }
            super._metadata = { extracted: true };
        }
    }
}

module.exports = MockMetadata;