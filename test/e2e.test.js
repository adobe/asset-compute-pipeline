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

'use strict';

// alternative debug configuration in VSCode
// in settings.json under mochaExplorer.env add these
//   "DEBUG": "pipeline:*",
//   "DEBUG_HIDE_DATE": "1",

process.env.DEBUG_HIDE_DATE = "1";

const debugConfig = require('debug');
debugConfig.enable("pipeline:*,test:*");
//const debug = require('debug')('test:engine');

const path = require("path");
// const fs = require("fs-extra");
require('dotenv').config({ path: path.join(__dirname, 'test.env') });

describe.skip("E2E Pipeline tests", function () {
    before(function () {
        process.env.__OW_NAMESPACE = process.env.OW_NAMESPACE;
        process.env.__OW_API_KEY = process.env.OW_API_KEY;
        process.env.WORKER_BASE_DIRECTORY = 'build/work';
    });

    after(function(){
        delete process.env.__OW_NAMESPACE;
        delete process.env.__OW_API_KEY; 
        delete process.env.WORKER_BASE_DIRECTORY;
    });

});
