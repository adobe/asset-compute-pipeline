
/* eslint-disable notice/notice */
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
const fs = require('fs-extra');
const validUrl = require('valid-url');
const child_process = require('child_process');

const EXIFTOOL_TIMEOUT_MS = 20 * 1000; // max timeout of 20 seconds

/**
 * Retrieve image metadata
 * @param {String} path url or path to image(required)
 */
async function getImageMetadata(path) {
    let metadata = {};

    console.log('getImageMetadata', path);

    if (path && (await fs.pathExists(path))) {
        const command = `exiftool -json "${path}"`;

        try {
            console.log(`Running command: ${command}`);
            const stdout = child_process.execSync(command, {
                timeout: EXIFTOOL_TIMEOUT_MS
            });

            const rawJSON = JSON.parse(stdout)[0];
            metadata = rawJSON;
        } catch (error) {
            console.error(`error getting metadata via exiftool for source file: ${path}`);
            console.error(error);
        }

    } else if (typeof (path) === 'string' && validUrl.isHttpsUri(path)) {
        try {
            const command = `curl -s "${path}" | exiftool -json - `;
            console.log(`Running command: ${command}`);
            const stdout = child_process.execSync(command, {
                timeout: EXIFTOOL_TIMEOUT_MS
            });

            const rawJSON = JSON.parse(stdout)[0];
            metadata = rawJSON;
        } catch (error) {
            console.error(`error getting metadata via exiftool for source file: ${path}`);
            console.error(error);
        }
    }
    return metadata;  // returns default {} if no metadata found or error
}

module.exports = {
    getImageMetadata
};
