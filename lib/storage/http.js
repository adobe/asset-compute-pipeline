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
const fs = require('fs-extra');

const MAX_RETRY_DURATION_UPLOAD = 900000; // 15 mins
const DEFAULT_MAX_CONCURRENT = 8;
const DEFAULT_PREFERRED_PART_SIZE = 100 * 1024 * 1024; // Default part size is 100mb

// cgroup file paths for v1 and v2
const CONTAINER_MEMORY_SIZE_CGROUPV1 = '/sys/fs/cgroup/memory/memory.limit_in_bytes';
const CONTAINER_MEMORY_SIZE_CGROUPV2 = '/sys/fs/cgroup/memory.max';

/**
 * Get max concurrent value for node-httptransfer block transfer
 *  - This is to make sure there is enough memory available inside the container for httptransfer to handle the block transfer
 *  - If there is not enough memory available to handle the worst case (maxConcurrent * preferredPartSize), decrease maxConcurrent value
 * @param {Number} preferredPartSize preferred part size for transferring chunks in MB
 * @returns maxConcurrent integer value
 */
async function getMaxConcurrent(preferredPartSize) {
    let containerMemorySize;
    try {
        // Try cgroupv2, fallback to cgroupv1
        let rawContainerMemory;
        try {
            rawContainerMemory = await fs.readFile(CONTAINER_MEMORY_SIZE_CGROUPV2);
            const trimmedMemory = rawContainerMemory.toString().trim();
            // cgroupv2 can have the string 'max' - use default max concurrency
            if (trimmedMemory === 'max') {
                return DEFAULT_MAX_CONCURRENT;
            }
        } catch (error) {
            console.log(`cgroupv2 failed with: ${error}, falling back to cgroupv1`);
            rawContainerMemory = await fs.readFile(CONTAINER_MEMORY_SIZE_CGROUPV1);
        }
        // parse container memory
        containerMemorySize = parseInt(rawContainerMemory, 10) || undefined;
    } catch (e) {
        // log error for reference but ignore
        console.error(`Error getting max concurrent value: ${e}`);
    }
    if (!Number.isFinite(containerMemorySize)) {
        // if undefined or not a valid finite number, return default max concurrency
        // this could happen if not running in the context of a docker container
        return DEFAULT_MAX_CONCURRENT;
    }
    // total max memory that could be used at one time by node-httptransfer
    const maxTotalMemory = preferredPartSize * DEFAULT_MAX_CONCURRENT;
    const memoryNeeded = maxTotalMemory + (maxTotalMemory * 0.2); // add 20% memory buffer for other processing
    if (containerMemorySize > memoryNeeded) {
        return DEFAULT_MAX_CONCURRENT;
    } else {
        // if not enough memory available in the container for the worst case, 
        // decrease concurrency value based on available memory
        // save 20% memory as a buffer for other processing
        return Math.floor((containerMemorySize - (containerMemorySize * 0.2))/ preferredPartSize);
    }
}

async function download(asset, file) {
    try {
        const mimetype = asset.type || asset.mimetype || asset.mimeType;
        console.log(`downloading asset ${AssetComputeLogUtils.redactUrl(asset.url)} into ${file}\nheaders:`, asset.headers);
        console.log(`asset content type: ${mimetype}, size: ${asset.size}`);

        const preferredPartSize = process.env.HTTP_TRANSFER_PREFERRED_PART_SIZE || DEFAULT_PREFERRED_PART_SIZE;
        const maxConcurrent = await getMaxConcurrent(preferredPartSize);

        await http.downloadFileConcurrently(asset.url, file, {
            retryEnabled: !process.env.ASSET_COMPUTE_DISABLE_RETRIES,
            headers: asset.headers,
            contentType: mimetype,
            fileSize: asset.size,
            maxConcurrent: maxConcurrent,
            preferredPartSize: preferredPartSize
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

    const preferredPartSize = process.env.HTTP_TRANSFER_PREFERRED_PART_SIZE || DEFAULT_PREFERRED_PART_SIZE;
    const maxConcurrent = await getMaxConcurrent(preferredPartSize);
    try {
        if (typeof target === 'string') {
            console.log(`uploading rendition ${file} to ${AssetComputeLogUtils.redactUrl(target)}, size = ${rendition.size()}`);
            await http.uploadFileConcurrently(file, target, {
                retryEnabled: !process.env.ASSET_COMPUTE_DISABLE_RETRIES,
                headers: {
                    'content-type': contentType
                },
                maxConcurrent: maxConcurrent,
                preferredPartSize: preferredPartSize
            });
            rendition.isUploadComplete = true;
            console.log(`successfully finished uploading rendition`);

        } else if (typeof target === 'object' && Array.isArray(target.urls)) {
            console.log(`uploading rendition ${file} as multi-part to ${AssetComputeLogUtils.redactUrl(target.urls[0])} and ${target.urls.length-1} more urls, size = ${rendition.size()}`);
            await http.uploadMultiPartFileConcurrently(file, target, {
                retryEnabled: !process.env.ASSET_COMPUTE_DISABLE_RETRIES,
                retryMaxDuration: process.env.ASSET_COMPUTE_TEST_RETRY_DURATION || MAX_RETRY_DURATION_UPLOAD,
                headers: {
                    'content-type': contentType
                },
                maxConcurrent: maxConcurrent,
                preferredPartSize: preferredPartSize
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
