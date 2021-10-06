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

/* eslint-env mocha */
/* eslint mocha/no-mocha-arrows: "off" */

'use strict';

const fse = require('fs-extra');
const assert = require('assert');
const sinon = require('sinon');

const path = require('path');
const {createDirectories, cleanupDirectories, createBaseDirectory} = require('../lib/prepare');

describe('prepare.js', () => {
    beforeEach(() => {
        // we actually want to test that fs behaves as expected
        //process.env.WORKER_TEST_MODE = null;
        process.env.__OW_ACTION_NAME = 'test_action_fs';
        process.env.__OW_ACTIVATION_ID = 'test_activation_id';
    });

    afterEach(() => {
        fse.removeSync(path.resolve("work"));
    });
    it('creates base directories', async () => {
        const result = createBaseDirectory();
        const baseDir = path.resolve("work", process.env.__OW_ACTIVATION_ID); // base directory without folder name
        assert.strictEqual(result, baseDir);

        // check directories were created
        const existence = await fse.pathExists(baseDir);
        assert.ok(existence, "Base directory does not exist");
        // cleanup
        await fse.remove(baseDir);
    });

    it('creates needed directories, no folder name', async () => {
        const result = await createDirectories();

        const baseDir = path.resolve("work", process.env.__OW_ACTIVATION_ID); // base directory without folder name
        assert.strictEqual(result.base,baseDir);

        // check directories were created
        const existence = await fse.pathExists(baseDir);
        assert.ok(existence, "Base directory does not exist");
        // cleanup
        await fse.remove(baseDir);
    });
    it('creates needed directories with folder prefix', async () => {
        const result = await createDirectories('myfolder');

        const baseDir = path.resolve("work", process.env.__OW_ACTIVATION_ID, 'myfolder');

        assert.ok(result.base.includes(baseDir));

        // check directories were created
        const existence = await fse.pathExists(result.base);
        assert.ok(existence, "Base directory does not exist");

        // cleanup
        await fse.remove(baseDir);
    });
    it('creates needed directories, from base directory', async () => {
        let result = createBaseDirectory();
        const baseDir = path.resolve("work", process.env.__OW_ACTIVATION_ID); // base directory without folder name
        assert.strictEqual(result, baseDir);

        result = await createDirectories('myfolder', baseDir);

        const newBaseDir = path.resolve("work", process.env.__OW_ACTIVATION_ID, "myfolder"); // base directory without folder name
        assert.strictEqual(result.base,newBaseDir);

        // check directories were created
        const existence = await fse.pathExists(newBaseDir);
        assert.ok(existence, "Base directory does not exist");
        // cleanup
        await fse.remove(baseDir);
    });

    it('does not throw if directories to create already exist', async () => {
        // make sure directories exist
        const folderName = 'folder';
        await fse.mkdir(path.resolve("work"));
        const baseDir = path.resolve("work", process.env.__OW_ACTIVATION_ID, folderName);

        await fse.mkdirs(path.resolve(baseDir, "in"));
        await fse.mkdirs(path.resolve(baseDir, "out"));
        let existence = await fse.pathExists(baseDir);
        assert.ok(existence, "test setup failed - base directory does not exist");
        existence = await fse.pathExists(path.resolve(baseDir, "in"));
        assert.ok(existence, "test setup failed - in directory does not exist");
        existence = await fse.pathExists(path.resolve(baseDir, "out"));
        assert.ok(existence, "test setup failed - out directory does not exist");
        existence = false;

        // existence = false;
        const result = await createDirectories(folderName);
        assert.ok(result.base.includes(baseDir));

        // check directories were created
        existence = await fse.pathExists(baseDir);
        assert.ok(existence, "Base directory does not exist");

        // cleanup
        await fse.remove(baseDir);
    });

    it('cleans up folders on the filesystem', async () => {
        await fse.mkdir(path.resolve("work"));
        const baseDir = path.resolve("work", process.env.__OW_ACTIVATION_ID);
        const inDir = path.resolve(baseDir, "in");
        const outDir = path.resolve(baseDir, "out");

        await fse.mkdir(baseDir);
        await fse.mkdirs(inDir);
        await fse.mkdirs(outDir);
        let existence = await fse.pathExists(baseDir);
        assert.ok(existence, "test setup failed - base directory does not exist");
        existence = await fse.pathExists(inDir);
        assert.ok(existence, "test setup failed - in directory does not exist");
        existence = await fse.pathExists(outDir);
        assert.ok(existence, "test setup failed - out directory does not exist");

        const transformerDir = {
            base: baseDir
        };
        const directories = [transformerDir];
        const res = await cleanupDirectories(directories);
        assert.strictEqual(res, true);

        existence = await fse.pathExists(baseDir);
        assert.ok(!existence, "base directory still exist");
        existence = await fse.pathExists(inDir);
        assert.ok(!existence, "in directory still exist");
        existence = await fse.pathExists(outDir);
        assert.ok(!existence, "out directory still exist");

        // work directory should not be deleted
        existence = await fse.pathExists(path.resolve("work"));
        assert.ok(existence, "work directory does not exist");

        // cleanup
        await fse.remove(baseDir);
    });

    it('does not throw if directories to remove do not exist', async () => {
        // make sure directories DO NOT exist
        const baseDir = path.resolve("work", process.env.__OW_ACTIVATION_ID);
        const inDir = path.resolve(baseDir, "in");
        const outDir = path.resolve(baseDir, "out");

        let existence = await fse.pathExists(baseDir);
        assert.ok(!existence, "test setup failed - base directory does exist");
        existence = await fse.pathExists(inDir);
        assert.ok(!existence, "test setup failed - in directory does exist");
        existence = await fse.pathExists(outDir);
        assert.ok(!existence, "test setup failed - out directory does exist");

        const transformerDir = {
            base: baseDir
        };
        const directories = [transformerDir];
        const res = await cleanupDirectories(directories);
        assert.strictEqual(res, true);

        existence = await fse.pathExists(baseDir);
        assert.ok(!existence, "base directory exists");
        existence = await fse.pathExists(inDir);
        assert.ok(!existence, "in directory exists");
        existence = await fse.pathExists(outDir);
        assert.ok(!existence, "out directory exists");

        // work directory should not be deleted
        existence = await fse.pathExists(path.resolve("work"));
        assert.ok(!existence, "work directory exists");
    });

    it('does not throw if directories param is empty (no side-effects)', async () => {
        const baseDir = path.resolve("work", process.env.__OW_ACTIVATION_ID);
        const inDir = path.resolve(baseDir, "in");
        const outDir = path.resolve(baseDir, "out");

        // make sure directories DO NOT exist
        const directories = [];
        const res = await cleanupDirectories(directories);
        assert.strictEqual(res, true);

        let existence = await fse.pathExists(baseDir);
        assert.ok(!existence, "base directory exists");
        existence = await fse.pathExists(inDir);
        assert.ok(!existence, "in directory exists");
        existence = await fse.pathExists(outDir);
        assert.ok(!existence, "out directory exists");

        // work directory should not be deleted
        existence = await fse.pathExists(path.resolve("work"));
        assert.ok(!existence, "work directory exists");
    });

    it('does not throw if directory in list is null (no side-effects)', async () => {
        const baseDir = path.resolve("work", process.env.__OW_ACTIVATION_ID);
        const inDir = path.resolve(baseDir, "in");
        const outDir = path.resolve(baseDir, "out");

        // make sure directories DO NOT exist
        const directories = [null];
        const res = await cleanupDirectories(directories);
        assert.strictEqual(res, true);

        let existence = await fse.pathExists(baseDir);
        assert.ok(!existence, "base directory exists");
        existence = await fse.pathExists(inDir);
        assert.ok(!existence, "in directory exists");
        existence = await fse.pathExists(outDir);
        assert.ok(!existence, "out directory exists");

        // work directory should not be deleted
        existence = await fse.pathExists(path.resolve("work"));
        assert.ok(!existence, "work directory exists");
    });
    it('does not throw if directories param is null (no side-effects)', async () => {
        const baseDir = path.resolve("work", process.env.__OW_ACTIVATION_ID);
        const inDir = path.resolve(baseDir, "in");
        const outDir = path.resolve(baseDir, "out");

        // make sure directories DO NOT exist
        const directories = null;
        const res = await cleanupDirectories(directories);
        assert.strictEqual(res, true);

        let existence = await fse.pathExists(baseDir);
        assert.ok(!existence, "base directory exists");
        existence = await fse.pathExists(inDir);
        assert.ok(!existence, "in directory exists");
        existence = await fse.pathExists(outDir);
        assert.ok(!existence, "out directory exists");

        // work directory should not be deleted
        existence = await fse.pathExists(path.resolve("work"));
        assert.ok(!existence, "work directory exists");
    });

    it('cleans up work directory if it already exists', async () => {
        await fse.mkdir(path.resolve("work"));
        const baseDir = path.resolve("work", process.env.__OW_ACTIVATION_ID);
        const inDir = path.resolve(baseDir, "in");
        const outDir = path.resolve(baseDir, "out");

        // make additional directories under work
        const moreDir1 = path.resolve("work", "test-1");
        await fse.mkdir(moreDir1);
        let existence = await fse.pathExists(moreDir1);
        assert.ok(existence, "test setup failed");
        const moreDir2 = path.resolve("work", "test-2");
        await fse.mkdir(moreDir2);
        existence = await fse.pathExists(moreDir2);
        assert.ok(existence, "test setup failed");
        const moreDir3 = path.resolve("work", "test-3");
        await fse.mkdir(moreDir3);
        existence = await fse.pathExists(moreDir3);
        assert.ok(existence, "test setup failed");

        await fse.mkdir(baseDir);

        // make additional directories under baseDir
        const moreDirToMove = path.resolve(baseDir, "in1");
        await fse.mkdir(moreDirToMove);
        existence = await fse.pathExists(moreDirToMove);
        assert.ok(existence, "test setup failed");
        const moreDirToMove2 = path.resolve(baseDir, "in2");
        await fse.mkdir(moreDirToMove2);
        existence = await fse.pathExists(moreDirToMove2);
        assert.ok(existence, "test setup failed");

        await fse.mkdir(inDir);
        await fse.mkdir(outDir);
        existence = await fse.pathExists(baseDir);
        assert.ok(existence, "test setup failed - base directory does not exist");
        existence = await fse.pathExists(inDir);
        assert.ok(existence, "test setup failed - in directory does not exist");
        existence = await fse.pathExists(outDir);
        assert.ok(existence, "test setup failed - out directory does not exist");

        const transformerDir = {
            base: baseDir
        };
        const directories = [transformerDir];
        const res = await cleanupDirectories(directories);
        assert.strictEqual(res, true);

        // items under baseDir should be cleaned
        existence = await fse.pathExists(moreDirToMove);
        assert.ok(!existence, "baseDir not cleaned properly");
        existence = await fse.pathExists(moreDirToMove2);
        assert.ok(!existence, "baseDir not cleaned properly");

        existence = await fse.pathExists(baseDir);
        assert.ok(!existence, "base directory still exist");
        existence = await fse.pathExists(inDir);
        assert.ok(!existence, "in directory still exist");
        existence = await fse.pathExists(outDir);
        assert.ok(!existence, "out directory still exist");

        // work directory should not be deleted
        existence = await fse.pathExists(path.resolve("work"));
        assert.ok(existence, "work directory does not exist");

        // other items directly under work should not be cleaned
        // this is tested to ensure future concurrency does not trigger bigs
        existence = await fse.pathExists(moreDir1);
        assert.ok(existence, "work directory original content was removed");
        existence = await fse.pathExists(moreDir2);
        assert.ok(existence, "work directory original content was removed");
        existence = await fse.pathExists(moreDir3);
        assert.ok(existence, "work directory original content was removed");

        // cleanup
        await fse.remove(baseDir);
    });

    it("fails when trying to remove directories", async () => {
        const stub = sinon.stub(fse, 'remove').rejects("reject to trigger error");

        const res = await cleanupDirectories({
            base: '/dev/null'
        });

        assert.strictEqual(res, false);

        stub.restore();
    });

    it('creates transformers directories and cleans them', async () => {
        const baseDir = createBaseDirectory();
        const directories = [];
        const T1 = await createDirectories('transformer1', baseDir);
        const T2 = await createDirectories('transformer2', baseDir);
        directories.push(T1, T2);

        const res = await cleanupDirectories(directories);
        assert.strictEqual(res, true);

        let existence = await fse.pathExists(T1.base);
        assert.ok(!existence, "T1 directory still exist");
        existence = await fse.pathExists(T2.base);
        assert.ok(!existence, "T2 directory still exist");

        // base directory should not be deleted as it can be used in subsequent engine.run() calls
        existence = await fse.pathExists(baseDir);
        assert.ok(existence, "base directory should still exist");

        // cleanup
        await fse.remove(baseDir);
    });
    it('creates transformers directories and cleans them -- final rendition does not exist', async () => {
        const baseDir = createBaseDirectory();
        const directories = [];
        const T1 = await createDirectories('transformer1', baseDir);
        const T2 = await createDirectories('transformer2', baseDir);
        directories.push(T1, T2);

        const res = await cleanupDirectories(directories, 'hello.txt');
        assert.strictEqual(res, true);

        let existence = await fse.pathExists(T1.base);
        assert.ok(!existence, "T1 directory still exist");
        existence = await fse.pathExists(T2.base);
        assert.ok(!existence, "T2 directory still exist");

        // base directory should not be deleted as it can be used in subsequent engine.run() calls
        existence = await fse.pathExists(baseDir);
        assert.ok(existence, "base directory should still exist");

        // cleanup
        await fse.remove(baseDir);
    });
});
