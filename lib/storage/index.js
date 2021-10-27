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

const Asset = require('../asset');
const { AssetComputeLogUtils, GenericError, SourceUnsupportedError } = require('@adobe/asset-compute-commons');
const http = require('./http');
const datauri = require('./datauri');
const { Rendition } = require('../rendition');
const { URL } = require('url');
const fs = require("fs-extra");
const path = require('path');
const mime = require('mime-types');
const validUrl = require('valid-url');
const validDataUrl = require('valid-data-url');

const SOURCE_BASENAME = 'source';

class Storage {
    static async getAsset(assetReference, directory, name, disableDownload) {
        // normalize asset reference to be an object
        if(!assetReference) {
            throw new GenericError('Missing assetReference');
        }
        if (typeof assetReference === 'string') {
            assetReference = { url: assetReference };
        }
    
        if (process.env.WORKER_TEST_MODE) {
            // local file support for `Asset Compute test-worker` unit tests
            // not supported for clients in production
            // params.source.url will just be a filename like 'file.jpg'
            name = assetReference.url;
            const filePath = path.join(directory, name);
            if (!await fs.pathExists(filePath)) {
                throw new Error(`Invalid or missing local file ${name}`);
            }
            console.log("WORKER_TEST_MODE: asset path:", filePath);
            return new Asset(assetReference, directory, name);
        }
    
        const source = new Asset(assetReference, directory, name);
        // syncing with SDK code
        // addition changes to refactor is added
        if (!validDataUrl(assetReference.url) && !validUrl.isHttpsUri(assetReference.url)) {
            throw new SourceUnsupportedError(`${assetReference.url} must be a valid https url or datauri`);
        }
        const protocol = new URL(assetReference.url).protocol;
        if (protocol === 'data:') {
            console.log("creating asset from data url:", source.path);
            await datauri.download(assetReference, source.path);
            if(!Storage.fileExistsAndIsNotEmpty(source.path)){
                console.log(`file ${source.path} does not exist after datauri write to local fs`);
                throw new SourceUnsupportedError(`Invalid or missing local file ${source.path}`);
            }
            if (disableDownload) {
                console.log(`Skipping source file download for ${AssetComputeLogUtils.redactUrl(source.url)}`);
                const preSignedUrl = await datauri.getPreSignedUrl(source.path);
                console.log(`Uploaded data URI content to storage and generated presigned url`);
                assetReference.url = preSignedUrl;
                return new Asset(assetReference, directory, name);
            }
        } else if (!disableDownload && protocol === 'https:') {
            console.log("downloading asset:", source.path);
            await http.download(assetReference, source.path);
        } else {
            console.log(`Neither a data uri nor https disableDownload:${disableDownload} and protocol: ${protocol}`);
        }
    
        return source;
    }
    
    // function to return an extension for a file
    // if not empty returns a leading period
    // prefers extension from the file over name determined by mimeType
    static getExtension(filename, mimeType) {
        let ext;
        if (filename) {
            ext = path.extname(filename);
        }
        if (!ext && mimeType) {
            const mimeExt = mime.extension(mimeType);
            ext = mimeExt ? `.${mimeExt}` : '';
        }
        return ext;
    }
    
    /**
     * Returns if the file exists and is not empty
     *
     * @param {Number} path location of the file
     * @returns {Boolean} Returns false if file does not exist or is empty
     */
    static fileExistsAndIsNotEmpty(path) {
        if(path && fs.existsSync(path)){
            const fileStats =  fs.statSync(path);
            if(fileStats.size !== 0){
                return true;
            }
        }
        return false;
    }
    
    // There is at least one worker (graphics magick) that in some cases depends
    // upon the file extension so it is best to try to use the appropriate one
    // based on the filename, url, or mimetype
    static getSourceFilename(source) {
        if (source.name) {
            return `${SOURCE_BASENAME}${Storage.getExtension(source.name, source.mimeType)}`;
        }
    
        if (source.url && validUrl.isUri(source.url)) {
            const basename = path.basename(new URL(source.url).pathname);
            return  `${SOURCE_BASENAME}${Storage.getExtension(basename, source.mimeType)}`;
        }
    
        return `${SOURCE_BASENAME}${Storage.getExtension(null, source.mimeType)}`;
    }
    
    static async getSource(paramsSource, inDirectory, disableSourceDownload) {
        // normalize asset reference to be an object
        if (typeof paramsSource === 'string') {
            paramsSource = { url: paramsSource };
        }
        const name = Storage.getSourceFilename(paramsSource);
        return Storage.getAsset(paramsSource, inDirectory, name, disableSourceDownload);
    }
    
    static async putRendition(rendition, directories) {
        // Note: validation has happened in validate.js before
        if (process.env.WORKER_TEST_MODE) {
            if (rendition.directory === directories.postprocessing) {
                // copy the post processing rendition to the rendition path as expected by "aio asset-compute test-worker"
                // but leave the rendition at its original path since worker.js still needs to read from it for metrics etc.
                
                // post processing does not apply for pipeline
                const isPipelineRendition = false;
                const newRendition = new Rendition(rendition.instructions, directories.out, rendition.index, isPipelineRendition);
        
                console.log(`WORKER_TEST_MODE: copying ${rendition.path} to ${newRendition.path}`);
                await fs.copy(rendition.path, newRendition.path);
        
                rendition = newRendition;
            }
    
            // asset-compute-cli command run-worker wants file named as originally requested through "name"
            // however, computing the metadata wants the current path, so we need to make a copy not just rename
            if (rendition.instructions.name) {
                const newPath = path.join(rendition.directory, rendition.instructions.name);
    
                console.log(`WORKER_TEST_MODE: copying ${rendition.path} to ${newPath}`);
                await fs.copyFile(rendition.path, newPath);
            }
    
        } else if (!rendition.shouldEmbedInIOEvent()) {
            await http.upload(rendition);
        }
    }
}

module.exports = { Storage };