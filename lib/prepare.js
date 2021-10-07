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
const fse = require('fs-extra');
//const debug = require('debug')('pipeline:engine:prepare');
const debug=console.log;

const IN_DIRECTORY = "in";
const OUT_DIRECTORY = "out";
const POST_PROCESSING_DIRECTORY = "post";
const WORK_DIRECTORY = "work";


// helper function to come up with base directory
function getBaseDirectory() {
    const baseLocation = process.env.WORKER_BASE_DIRECTORY || WORK_DIRECTORY;
    return path.resolve(baseLocation, (process.env.__OW_ACTIVATION_ID || Date.now().toString()));
}

function createBaseDirectory() {
    // if container has disk full, it may fail to create base directories

    // all relative to current directory,
    // inside openwhisk nodejs container this would be:
    //
    //    /nodejsAction/xyz123

    // structure we create underneath the current dir:
    //
    //     work/
    //       <activationid>/   <- base
    const base = getBaseDirectory();
    
    // clean work directory if it might exist already
    fse.removeSync(base);
    fse.mkdirsSync(base);
    return base;

}

async function createDirectories(folderName, baseDirectory, pipeline = true) {
    // all relative to current directory,
    // inside openwhisk nodejs container this would be:
    //
    //    /nodejsAction/xyz123

    // structure we create underneath the current dir:
    //
    //     work/
    //       <activationid>/            <- base
    //           <folderName>/          <- folderName


    const directories = {};

    if (!baseDirectory) {
        baseDirectory = getBaseDirectory();
    }
    directories.base = path.resolve(baseDirectory, folderName || "");

    directories.in   = path.resolve(directories.base, IN_DIRECTORY);
    directories.out  = path.resolve(directories.base, OUT_DIRECTORY);

    console.log(`work directory        : ${directories.base}`);
    console.log(`- source directory    : ${directories.in}`);
    console.log(`- renditions directory: ${directories.out}`);

    // clean work directory if it might exist already
    await fse.remove(directories.base);

    await fse.mkdirs(directories.in);
    await fse.mkdirs(directories.out);

    if (!pipeline) {
        debug(`Creating post-processing dir for non-pipeline mode`);
        console.log(`- post-processing dir : ${directories.postprocessing}`);
        directories.postprocessing = path.resolve(directories.out, POST_PROCESSING_DIRECTORY);
        await fse.mkdirs(directories.postprocessing);
    }

    // for test-worker framework, input and output are mounted at /in and /out
    // random access reading and writing from that mount can be problematic on Docker for Mac at least,
    // so we are copying all files over into the container
    if (process.env.WORKER_TEST_MODE) {
        try {
            await fse.copy("/in", directories.in);
        } catch (e) {
            // sometimes this fails sporadically for unknown reason, so we retry once
            console.log(`WORKER_TEST_MODE: copying /in to ${directories.in} failed, retrying... (${e.message})`);
            try {
                await fse.copy("/in", directories.in);
            } catch (e) {
                console.log(`WORKER_TEST_MODE: copying /in to ${directories.in} failed:`);
                throw e;
            }
        }
    }

    return directories;
}

// should never rethrow errors (called in catch portions of try/catch)
/**
 * Move final output file to location expected for WORKER_TEST_MODE
 * Remove all contents of directories
 * @param {Array} directories list of transformer directories
 * @param {String} outputPath final output path to move to /out for WORKER_TEST_MODE
 */
async function cleanupDirectories(directories, outputPath) {
    if (!directories || typeof directories !== 'object') {
        // cleanup returning false means we kill the container to avoid a data leak
        // if there are no directories or directories is not an array, don't return false
        return true;
    }

    const copyOptions = {
        // Make sure symlinks are copied as binaries and not symlinks
        dereference: true,
        // ensure files can be read by host system by running chmod before copy
        filter: src => {
            fse.chmodSync(src, 0o766);
            debug(`WORKER_TEST_MODE: copying ${src} to /out`);
            return true;
        }
    };

    try {
        // WORKER_TEST_MODE: copy result to /out
        if(process.env.WORKER_TEST_MODE && outputPath){
            await fse.copy(path.dirname(outputPath), "/out", copyOptions);
        }

        for (const directory of directories) {
            if(process.env.WORKER_TEST_MODE){
                await fse.copy(directory.out, "/out", copyOptions);
            }
            if (directory && directory.base) {
                // should also remove metadata (error and mimetype) files, if not already cleaned
                console.log('removing entire directory', directory.base);
                await fse.remove(directory.base);
            }
        }
    } catch (err) {
        debug(`Error while cleaning up work directories: ${err.message || err}`);
        return false;
    }
    return true;
}


module.exports = {
    createBaseDirectory,
    createDirectories,
    cleanupDirectories
};