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
const { Prepare } = require('../prepare');

const { Utils, Timer } = require('../utils');

const INTERNAL = Symbol("internal");
class EngineContext {
    constructor(engine, params) {
        this[INTERNAL] = {};

        this[INTERNAL].engine = engine;

        this[INTERNAL].baseDirectory = Prepare.createBaseDirectory(); // base directory for all transformer directories
        this[INTERNAL].transformerDirectories = []; // list of all the transformer directories
        this[INTERNAL].tempCloudStorageFiles = []; // list of files created in temporary cloud storage to be removed during clean up
        this[INTERNAL].renditionErrors = [];

        if (params && params.metrics) {
            this[INTERNAL].metrics = params.metrics;
        } else {
            this[INTERNAL].metrics = new AssetComputeMetrics(params);
        }

        this[INTERNAL].workerStartTime = new Date();
        this[INTERNAL].processingStartTime = params.times.gateway ?
            new Date(params.times.gateway) :
            new Date(params.times.process);

        this[INTERNAL].metrics.add({
            pipeline: true,
            startWorkerDuration: Utils.durationSec(this[INTERNAL].processingStartTime, this[INTERNAL].workerStartTime),
            gatewayToProcessDuration: Utils.durationSec(params.times.gateway, params.times.process),
            processToCoreDuration: Utils.durationSec(params.times.process, params.times.core),
            renditionCount: params.renditions && params.renditions.length
        });

        this[INTERNAL].timers = {
            processingTime: new Timer().start(),
            download: new Timer(),
            upload: new Timer()
        };
    }

    set baseDirectory(value) {
        this[INTERNAL].baseDirectory = value;
    }

    get baseDirectory() {
        return this[INTERNAL].baseDirectory;
    }

    get transformerDirectories() {
        return this[INTERNAL].transformerDirectories;
    }

    get tempCloudStorageFiles() {
        return this[INTERNAL].tempCloudStorageFiles;
    }

    get renditionErrors() {
        return this[INTERNAL].renditionErrors;
    }

    get workerStartTime() {
        return this[INTERNAL].workerStartTime;
    }

    get processingStartTime() {
        return this[INTERNAL].processingStartTime;
    }

    get metrics() {
        return this[INTERNAL].metrics;
    }

    get timers() {
        return this[INTERNAL].timers;
    }
}

module.exports = {
    EngineContext
};
