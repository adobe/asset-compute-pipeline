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

const http = require('@adobe/httptransfer');
const { AssetComputeLogUtils, GenericError, RenditionTooLarge } = require('@adobe/asset-compute-commons');
const { Action } = require('../action');

const MAX_RETRY_DURATION_UPLOAD = 900000; // 15 mins

async function download(asset, file) {
    try {
        console.log(`downloading asset ${AssetComputeLogUtils.redactUrl(asset.url)} into ${file}\nheaders:`, asset.headers);

        await http.downloadFile(asset.url, file, {
            retryEnabled: !process.env.ASSET_COMPUTE_DISABLE_RETRIES,
            headers: asset.headers
        });
        console.log('download finished successfully');

    } catch (err) {
        throw new GenericError(err.message, `${Action.name}_download`);
    }
}

async function upload(rendition) {
    const file = rendition.path;
    const target = rendition.target;
    if (!target) {
        console.warn(`rendition ${rendition.id()} does not have a target`);
        return;
    }

    if (!file) {
        throw new GenericError(`rendition ${rendition.id()} does not have a file path: ${file}`, `${Action.name}_upload`);
    }

    rendition.isUploading = true;
    const contentType = await rendition.contentType();
    try {
        if (typeof target === 'string') {
            console.log(`uploading rendition ${file} to ${AssetComputeLogUtils.redactUrl(target)}, size = ${rendition.size()}`);
            await http.uploadFile(file, target, {
                retryEnabled: !process.env.ASSET_COMPUTE_DISABLE_RETRIES,
                headers: {
                    'content-type': contentType
                }
            });
            rendition.isUploadComplete = true;
            console.log(`successfully finished uploading rendition`);

        } else if (typeof target === 'object' && Array.isArray(target.urls)) {
            console.log(`uploading rendition ${file} as multi-part to ${AssetComputeLogUtils.redactUrl(target.urls[0])} and ${target.urls.length-1} more urls, size = ${rendition.size()}`);
            await http.uploadAEMMultipartFile(file, target, {
                retryEnabled: !process.env.ASSET_COMPUTE_DISABLE_RETRIES,
                retryMaxDuration: process.env.ASSET_COMPUTE_TEST_RETRY_DURATION || MAX_RETRY_DURATION_UPLOAD,
                headers: {
                    'content-type': contentType
                }
            });
            rendition.isUploadComplete = true;
            console.log(`successfully finished uploading rendition`);
        }
    } catch (err) {
        rendition.isUploadError = true;
        console.log(err);
        if (err.message && err.message.includes('is too large to upload') || err.status === 413) {
            throw new RenditionTooLarge(`rendition size of ${rendition.size()} for ${rendition.name} is too large`);
        } else {
            throw new GenericError(err.message, `${Action.name}_upload`);
        }
    } finally {
        rendition.isUploading = false;
    }
}

/**
 * Does rendition require an upload currently?
 * @param {Rendition} rendition Rendition object
 * @returns true if rendition output has a path, a target and it is likely a valid url, and was not uploaded already
 */
function shouldUploadRendition(rendition) {
    if (!rendition || !rendition.target) {
        return false;
    } else if (rendition.shouldEmbedInIOEvent()) {
        return false;
    } else {
        return rendition.path && !rendition.isUploading && !rendition.isUploadComplete;
    }
}

/**
 * Upload rendition unless:
 * - It has already been uploaded or is currently being uploaded.
 * - It does not provide a target for upload
 * - It indicates that it should be embedded in IO event
 * @param {Rendition} rendition Rendition to be uploaded
 * @returns true if upload occurred, otherwise false.
 */
async function uploadRenditionOnce(output) {
    if(shouldUploadRendition(output)) {
        await upload(output);
        return true;
    } else {
        return false;
    }
}

module.exports = {
    download,
    upload,
    uploadRenditionOnce
};
