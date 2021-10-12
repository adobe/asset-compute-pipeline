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

const { AssetComputeMetrics } = require('@adobe/asset-compute-commons');

const INTERNAL = Symbol("internal");
class EngineContext {
    constructor(engine, params) {
        this[INTERNAL] = {};

        this[INTERNAL].engine = engine;

        this[INTERNAL].baseDirectory = null;
        this[INTERNAL].transformerDirectories = null;
        this[INTERNAL]._tempCloudStorageFiles = null;

        this[INTERNAL].renditionErrors = [];

        if(params && params.metrics){
            this[INTERNAL].metrics = this[INTERNAL].params.metrics;
        } else {
            this[INTERNAL].metrics = new AssetComputeMetrics(params);
        }

    }

    set baseDirectory(value) {
        this[INTERNAL].baseDirectory = value;
    }
    
    get baseDirectory() {
        return this[INTERNAL].baseDirectory;
    }

    set transformerDirectories(value) {
        this[INTERNAL].transformerDirectories = value;
    }
    
    get transformerDirectories() {
        return this[INTERNAL].transformerDirectories;
    }

    set tempCloudStorageFiles(value) {
        this[INTERNAL]._tempCloudStorageFiles = value;
    }
    
    get tempCloudStorageFiles() {
        return this[INTERNAL]._tempCloudStorageFiles;
    }

    set renditionErrors(value) {
        this[INTERNAL].renditionErrors = value;
    }
    
    get renditionErrors() {
        return this[INTERNAL].renditionErrors;
    }


    // TODO: Better isolate/abstract metrics
    set metrics(value) {
        this[INTERNAL].metrics = value;
    }
    
    get metrics() {
        return this[INTERNAL].metrics;
    }

    set workerStartTime(value) {
        this[INTERNAL].workerStartTime = value;
    }
    
    get workerStartTime() {
        return this[INTERNAL].workerStartTime;
    }

    set processingStartTime(value) {
        this[INTERNAL].processingStartTime = value;
    }
    
    get processingStartTime() {
        return this[INTERNAL].processingStartTime;
    }
}

module.exports = {
    EngineContext
};