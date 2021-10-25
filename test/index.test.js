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

"use strict";

const { Transformer, Plan, Engine } = require("../index");
const assert = require("assert");

describe("Test index.js", function() {

    it("instantiates transformer with json object as manifest", function() {
        const transformer = new Transformer("myTransformer", {
            "inputs": {
                "type": ["image/jpeg", "image/png"]
            },
            "outputs": {
                "type": ["image/jpeg", "image/png"]
            }
        });
        assert.ok(transformer instanceof Transformer);
    });
    it("instantiates empty plan and adds a step", function() {
        const plan = new Plan();
        plan.add("myTransformer", {});
        assert.ok(plan instanceof Plan);
    });
    it("starts pipeline engine and adds plan", function() {

        const transformer = new Transformer("myTransformer", {
            "inputs": {
                "type": ["image/jpeg", "image/png"]
            },
            "outputs": {
                "type": ["image/jpeg", "image/png"]
            }
        });

        const pipeline = new Engine();
        pipeline.registerTransformer(transformer);

        const plan = new Plan();
        plan.add("myTransformer", {});

        assert.strictEqual(plan.toString(), "[start] -> { myTransformer* }");
    });
});

describe("Test export index.js", function() {

    it("should export all API", function() {
        const pipeline = require("../index");
        assert.strictEqual(typeof pipeline.Action, "object");
        assert.strictEqual(typeof pipeline.Asset, "function");
        assert.strictEqual(typeof pipeline.Prepare, "function");
        assert.strictEqual(typeof pipeline.Rendition, "function");
        assert.strictEqual(typeof pipeline.Storage, "function");
        assert.strictEqual(typeof pipeline.Utils, "function");
        assert.strictEqual(typeof pipeline.Engine, "function");
        assert.strictEqual(typeof pipeline.Manifest, "function");
        assert.strictEqual(typeof pipeline.Transformer, "function");

    });
});
