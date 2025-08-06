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

const assert = require("assert");

const {Plan, PLAN_STATE} = require("../lib/plan");

function assertPlan(plan, string, obj) {
    assert.strictEqual(plan.toString(), string);
    assert.deepStrictEqual(plan.toObject(), obj);
}

describe("Plan", function() {

    it("constructor", function() {
        const plan = new Plan();

        // current node is special start
        assert.ok(plan.current.start);
        assert.throws(() => { plan.current.start = false; });
        assertPlan(plan, "[start]", []);
        assert.strictEqual(plan.state, PLAN_STATE.INITIAL);

        // empty plan has no next state
        // plan goes immediately from initial state to succeeded
        const next = plan.advance();
        assert.ok(next === null || next === undefined);
        assertPlan(plan, "start", []);
        assert.strictEqual(plan.state, PLAN_STATE.SUCCEEDED);
    });
    it("PLAN_STATE: initial -> inProgress -> succeeded", function() {
        const plan = new Plan();

        plan.add("one");

        assert.ok(plan.current.start); // still at start
        assert.strictEqual(plan.state, PLAN_STATE.INITIAL);

        // state advances to inProgress
        plan.advance();
        assert.strictEqual(plan.state, PLAN_STATE.IN_PROGRESS);

        // state advances to succeeded
        plan.advance();
        assert.strictEqual(plan.state, PLAN_STATE.SUCCEEDED);

        // second call to advance does nothing
        plan.advance();
        assert.strictEqual(plan.state, PLAN_STATE.SUCCEEDED);
    });
    it("PLAN_STATE: initial -> failed", function() {
        const plan = new Plan();

        plan.add("one");

        assert.ok(plan.current.start); // still at start
        assert.strictEqual(plan.state, PLAN_STATE.INITIAL);

        // state changes to failed
        plan.fail();
        assert.strictEqual(plan.state, PLAN_STATE.FAILED);

        // once state is in failed, it cannot be changed
        plan.advance();
        assert.strictEqual(plan.state, PLAN_STATE.FAILED);
    });
    it("PLAN_STATE: initial -> inProgress -> failed", function() {
        const plan = new Plan();

        plan.add("one");

        assert.ok(plan.current.start); // still at start
        assert.strictEqual(plan.state, PLAN_STATE.INITIAL);

        // state advances to inProgress
        plan.advance();
        assert.strictEqual(plan.state, PLAN_STATE.IN_PROGRESS);

        // state changes to failed
        plan.fail();
        assert.strictEqual(plan.state, PLAN_STATE.FAILED);

        // once state is in failed, it cannot be changed
        plan.advance();
        assert.strictEqual(plan.state, PLAN_STATE.FAILED);
    });
    it("PLAN_STATE: cannot go from succeeded to failed", function() {
        const plan = new Plan();

        assert.ok(plan.current.start); // still at start
        assert.strictEqual(plan.state, PLAN_STATE.INITIAL);

        // state advances to inProgress
        plan.advance();
        assert.strictEqual(plan.state, PLAN_STATE.SUCCEEDED);

        // once state is in succeeded, it cannot change
        plan.fail();
        assert.strictEqual(plan.state, PLAN_STATE.SUCCEEDED);
    });

    it("add", function() {
        const plan = new Plan();

        plan.add("one");

        assert.ok(plan.current.start); // still at start
        assert.strictEqual(plan.state, PLAN_STATE.INITIAL);

        assertPlan(plan, "[start] -> { one* }", [{
            name: "one"
        }]);

        plan.add("two", { input: "input", output: "output" });

        assert.ok(plan.current.start); // still at start

        assertPlan(plan, "[start] -> { one -> two* }", [{
            name: "one"
        },{
            name: "two",
            input: "input",
            output: "output"
        }]);
    });

    it("add too many", function() {
        const plan = new Plan();

        const MAX_NODES = 100;

        for (let i = 0; i < MAX_NODES; i++) {
            plan.add("step");
        }

        // can't add MAX_NODES + 1 nodes
        assert.throws(() => { plan.add("step too much"); }, { message: /[Tt]oo many nodes in plan.*101/ });
    });

    it("add nested group", function() {
        const plan = new Plan();

        plan.add("one");
        plan.advance();

        plan.add("nested1");

        assertPlan(plan, "start -> { [one] -> { nested1* } }", [{
            name: "one",
            current: true,
            steps: [{
                name: "nested1"
            }]
        }]);

        plan.add("nested2");

        assertPlan(plan, "start -> { [one] -> { nested1 -> nested2* } }", [{
            name: "one",
            current: true,
            steps: [{
                name: "nested1"
            },{
                name: "nested2"
            }]
        }]);
    });

    it("attributes", function() {
        const plan = new Plan();

        plan.add("step", { input: "input", output: "output" });
        const next = plan.advance();
        assert.strictEqual(next.attributes.input, "input");
        assert.strictEqual(next.attributes.output, "output");
        assert.strictEqual(next, plan.current);

        assertPlan(plan, "start -> { [step] }", [{
            name: "step",
            current: true,
            input: "input",
            output: "output"
        }]);
    });

    it("advance + multiple nesting levels", function() {
        const plan = new Plan();

        plan.add("one");

        let next = plan.advance();
        assert.ok(!next.start);
        assert.strictEqual(next.name, "one");
        assert.strictEqual(next, plan.current);

        plan.add("nested1");
        plan.add("nested2");
        plan.add("nested3");

        next = plan.advance();
        assert.ok(!next.start);
        assert.strictEqual(next.name, "nested1");
        assert.strictEqual(next, plan.current);

        next = plan.advance();
        assert.ok(!next.start);
        assert.strictEqual(next.name, "nested2");
        assert.strictEqual(next, plan.current);

        assertPlan(plan, "start -> { one -> { nested1 -> [nested2] -> nested3 } }", [{
            name: "one",
            steps: [{
                name: "nested1"
            },{
                name: "nested2",
                current: true
            },{
                name: "nested3"
            }]
        }]);

        plan.add("nested2-1");

        next = plan.advance();
        assert.ok(!next.start);
        assert.strictEqual(next.name, "nested2-1");
        assert.strictEqual(next, plan.current);

        assertPlan(plan, "start -> { one -> { nested1 -> nested2 -> { [nested2-1] } -> nested3 } }", [{
            name: "one",
            steps: [{
                name: "nested1"
            },{
                name: "nested2",
                steps: [{
                    name: "nested2-1",
                    current: true
                }]
            },{
                name: "nested3"
            }]
        }]);

        next = plan.advance();
        assert.ok(!next.start);
        assert.strictEqual(next.name, "nested3");
        assert.strictEqual(next, plan.current);

        plan.add("nested3-1");
        plan.add("nested3-2");

        assertPlan(plan, "start -> { one -> { nested1 -> nested2 -> { nested2-1 } -> [nested3] -> { nested3-1 -> nested3-2* } } }", [{
            name: "one",
            steps: [{
                name: "nested1"
            },{
                name: "nested2",
                steps: [{
                    name: "nested2-1"
                }]
            },{
                name: "nested3",
                current: true,
                steps: [{
                    name: "nested3-1"
                },{
                    name: "nested3-2"
                }]
            }]
        }]);

        next = plan.advance();
        assert.ok(!next.start);
        assert.strictEqual(next.name, "nested3-1");
        assert.strictEqual(next, plan.current);

        next = plan.advance();
        assert.ok(!next.start);
        assert.strictEqual(next.name, "nested3-2");
        assert.strictEqual(next, plan.current);

        next = plan.advance();
        assert.ok(next === null || next === undefined);
        assert.strictEqual(next, plan.current);
    });

    it("fromObject", function() {
        const obj = [{
            name: "one",
            input: "input",
            output: "output",

            steps: [{
                name: "nested1"
            },{
                name: "nested2",
                steps: [{
                    name: "nested2-1"
                }]
            },{
                name: "nested3",
                current: true,
                steps: [{
                    name: "nested3-1",
                    input: "input",
                    output: "output"
                },{
                    name: "nested3-2"
                }]
            }]
        }];
        const plan = Plan.fromObject(obj);

        assertPlan(plan, "start -> { one -> { nested1 -> nested2 -> { nested2-1 } -> [nested3] -> { nested3-1 -> nested3-2 } } }", obj);

        const nested3 = plan.current;
        assert.strictEqual(nested3.name, "nested3");

        const nested31 = plan.advance();
        assert.strictEqual(nested31.name, "nested3-1");
        assert.deepStrictEqual(nested31.attributes, {
            input: "input",
            output: "output"
        });
    });

    it("fromObject throws on incompatible input", function() {
        assert.throws(() => { Plan.fromObject(); });
        assert.throws(() => { Plan.fromObject({}); });
        assert.throws(() => { Plan.fromObject("string"); });
        assert.throws(() => { Plan.fromObject(2); });
        assert.throws(() => { Plan.fromObject(true); });
    });
});