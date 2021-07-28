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

/*
// examples
const request = {
    source: {
        url: "https://blobstore.com/image.psd"
    },
    rendition: {
        fmt: "machine-metadata-json",
        threshold: 0.5,
        target: "https://blobstore.com/rendition-metadata.json"
    }
};

const start = {
    currentPosition: [0], // stack index of step/node to be executed next
    steps: [{
        name: "worker-pie", // name of the transformer
        input: {
            url: "https://blobstore.com/image.psd",
            metadata: {
                // ...
            }
        },
        instruction: {
            fmt: "machine-metadata-json",
            threshold: 0.5
        },
        output: {
            target: "https://blobstore.com/rendition-metadata.json"
        },
        steps: [{
            name: "worker__callback", // sdk renditionCallback function
            input: {
                path: "input/file.psd",
                url: "https://blobstore.com/image.psd",
                metadata: {
                    // ...
                }
            },
            output: {
                path: "output/worker__callback-rendition.png"
            },
            instruction: {
                fmt: "png",
                width: 319,
                height: 319
            }
        }, {
            name: "sensei-image-autotag",
            input: {
                path: "output/worker__callback-rendition.png",
                metadata: {
                    // ...
                }
            },
            output: {
                path: "output/sensei-image-autotag-rendition.json"
            },
            instruction: {
                fmt: "machine-metadata-json",
                threshold: 0.5
            }
        }]
        // },{
        //     name: "custom-worker:12345"
    }]
};
*/

/**
Legend:
    <-    : current step
    <...> : something executes
-----------------------

start <-

<core: build plan>
<core: plan.add('worker-pie')>
<core: plan.add('custom-worker')>

start <-
    worker-pie
    custom-worker

<engine: plan.advance() -> returns 'worker-pie'>

start
    worker-pie <-
    custom-worker

<core: execute worker-pie, Transformer invokes action async>
<core: because of worker invocation execution continues there and we stop in core>

<worker-pie: retrieves plan>

start
    worker-pie <-
    custom-worker

<engine: plan.current() -> 'worker-pie'>
<worker-pie: runs sdk transformer for "worker-pie">
<sdk transformer: adds refined plan>
<sdk transformer: plan.add('callback')>
<sdk transformer: plan.add('sensei-auto-tagging')>

start
    worker-pie <-
        callback
        sensei-auto-tagging
    custom-worker

<engine: plan.advance() -> 'callback'>

start
    worker-pie
        callback <-
        sensei-auto-tagging
    custom-worker

<callback: runs>

start
    worker-pie
        callback <-
        sensei-auto-tagging
    custom-worker

<engine: plan.advance() -> 'sensei-auto-tagging'>

start
    worker-pie
        callback
        sensei-auto-tagging <-
    custom-worker

<sensei-auto-tagging: runs>

start
    worker-pie
        callback
        sensei-auto-tagging <-
    custom-worker

<engine: plan.advance() -> 'custom-worker'>

start
    worker-pie
        callback
        sensei-auto-tagging
    custom-worker <-

<custom-worker: runs>

<engine: plan.advance() -> undefined>

start
    worker-pie
        callback
        sensei-auto-tagging
    custom-worker
    <-

<engine: detects pipeline is finished, upload rendition>

*/

const MAX_STEP_COUNT = 100;

// plan PLAN_STATE
const PLAN_STATE = Object.freeze({
    INITIAL: 'initial',
    IN_PROGRESS: 'inProgress',
    FAILED: 'failed',
    SUCCEEDED: 'succeeded'
});

// Use Symbols for (somewhat) private fields in classes/objects
// yes, they could be read using Object.getOwnPropertySymbols() but this
// would be awkward and should prevent accidental usage using something._private

// holds private member fields
const INTERNAL = Symbol("internal");

class Step {
    constructor(name, next, attributes) {
        const internal = this[INTERNAL] = {};

        if (name) {
            internal.name = name;
            internal.next = next;
        } else {
            internal.name = "start";
            internal.start = true;
        }

        internal.attributes = attributes;

        internal.messages = []; // for log messages, warnings, errors, etc.
        internal.inputs = {}; // details about inputs
        internal.outputs = {}; // details about the ouput
    }

    get start() {
        return this[INTERNAL].start;
    }

    get name() {
        return this[INTERNAL].name;
    }

    get attributes() {
        return this[INTERNAL].attributes;
    }

    get messages() {
        return this[INTERNAL].messages;
    }
}

/**
 * Describes a multi-step conversion plan that can be refined along the way.
 */
class Plan {
    /**
     * Creates an empty plan.
     */
    constructor() {
        const internal = this[INTERNAL] = {};
        internal.start = new Step();
        internal.current = internal.start;
        internal.groupTail = null;
        internal.count = 0;
        internal.state = PLAN_STATE.INITIAL;

    }

    /**
     * Adds a step after the current step.
     * Can be called multiple times in a row to add a list after the current step.
     *
     * @param {String} name name of the step
     * @param {Object} attributes custom attributes for this step
     */
    add(name, attributes={}) {
        const internal = this[INTERNAL];

        internal.count++;
        if (internal.count > MAX_STEP_COUNT) {
            throw new Error(`Failed to add step '${name}': Too many nodes in plan: ${internal.count}`);
        }

        // add after end of nested group (if exists) or the current step
        // TODO: internal.current could be undefined (if at end)
        const cur = (internal.groupTail || internal.current)[INTERNAL];

        // insert the new step between cur and next (cur[next])
        const newStepObj = new Step(name, cur.next, attributes);
        cur.next = newStepObj;
        const newStep = newStepObj[INTERNAL];

        // move end of nested group forward
        if (cur.endGroup) {
            newStep.endGroup = cur.endGroup;
            delete cur.endGroup;
        }

        // if begin of nested group
        if (!internal.groupTail) {
            // mark beginning
            cur.beginGroup = true;
            // mark end of new group
            // if this already ends a group, we increase the end group counter
            newStep.endGroup = newStep.endGroup > 0 ? newStep.endGroup + 1 : 1;
        }

        // make added step the end of the group after which we'll add further steps
        internal.groupTail = newStepObj;
    }

    /**
     * Advances the plan to the next step and returns that step.
     * Returns null or undefined if the plan has ended and there is no more step.
     *
     * @returns {Step} the next step to execute or null/undefined if at the end
     */
    advance() {
        const internal = this[INTERNAL];

        // do not advance if plan state is failed or succeeded
        if (internal.state === PLAN_STATE.FAILED || internal.state === PLAN_STATE.SUCCEEDED) {
            return internal.current;
        }

        // end nested group once we advance
        if (internal.groupTail) {
            internal.groupTail = null;
        }

        internal.current = internal.current[INTERNAL].next;
        
        // if there are no next steps, the plan succeeded
        if (!internal.current) {
            internal.state = PLAN_STATE.SUCCEEDED;
        } else if (internal.state === PLAN_STATE.INITIAL) {
            internal.state = PLAN_STATE.IN_PROGRESS;
        }
        return internal.current;
    }

    /**
     * Returns the current step.
     * In the beginning, when no advance() has been called yet, this will return the special start step (step.start === true).
     * If the plan has finished, this will return null or undefined.
     *
     * @returns {Object} the next step to execute or null/undefined if at the end
     */
    get current() {
        return this[INTERNAL].current;
    }
 
    /**
     * Returns the current state of the plan.
     * Plan PLAN_STATE:
        `initial`: starting state before any steps have run
        `inProgress`: after calling `plan.advance()` until plan fails or succeeds
        `failed`: any time in the plan when `plan.fail()` is called
        `succeeded`: when all steps in the plan have been executed without `plan.fail()` being called
     *
     * @returns {String} the current state of the plan
     */
    get state() {
        return this[INTERNAL].state;
    }

    /**
     * Change state of plan to `failed`
     * Once plan is in failed state, it cannot change PLAN_STATE
     */
    fail() {
        if (this[INTERNAL].state !== PLAN_STATE.SUCCEEDED) {
            this[INTERNAL].state = PLAN_STATE.FAILED;
        }
    }

    /**
     * Returns a string representation of the plan for logging and debugging purposes.
     *
     * @returns {String}
     */
    toString() {
        // Examples:
        // start -> { [worker-pie] -> { callback -> sensei-auto-tagging } -> custom-worker }
        // start -> { one -> { [three] } -> two }

        const internal = this[INTERNAL];

        let str = '';
        let step = internal.start;

        while (step) {
            if (step === internal.current) {
                str += `[${step.name}]`;
            } else {
                str += step.name;
            }
            if (step === internal.groupTail) {
                str += '*';
            }

            if (step[INTERNAL].endGroup) {
                for (let i = 0; i < step[INTERNAL].endGroup; i++) {
                    str += ' }';
                }
            }
            if (step[INTERNAL].next) {
                str += ' -> ';
            }
            if (step[INTERNAL].beginGroup) {
                str += '{ ';
            }

            step = step[INTERNAL].next;
        }
        return str;
    }

    /**
     * Returns an array representation of this plan which can be serialized into JSON.
     * This can be parsed again using Plan.fromObject().
     *
     * @returns {Array} an array (which can contain nested objects)
     */
    toObject() {
        const internal = this[INTERNAL];

        const result = {
            steps: []
        };
        const stack = [];

        let parent = result;
        let step = internal.start[INTERNAL].next;
        while (step) {
            const node = {
                name: step.name,
                ...step.attributes
            };
            if (step === internal.current) {
                node.current = true;
            }

            parent.steps.push(node);

            if (step[INTERNAL].beginGroup) {
                stack.push(parent);
                node.steps = [];
                parent = node;

            } else if (step[INTERNAL].endGroup > 0) {
                for (let i = 0; i < step[INTERNAL].endGroup; i++) {
                    parent = stack.pop();
                }
                if (!parent) {
                    parent = result;
                }
            }

            step = step[INTERNAL].next;
        }

        return result.steps;
    }

    /**
     * Creates a plan from an object structure as created by toObject();
     *
     * This can be used to pass plans along via JSON.
     *
     * @param {Array} obj the array
     */
    static fromObject(obj) {

        function readNodes(plan, prevStep, nodes) {
            prevStep[INTERNAL].beginGroup = true;

            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];

                const attributes = {};
                for (const key of Object.keys(node)) {
                    if (key !== "name") {
                        attributes[key] = node[key];
                    }
                }

                const step = new Step(node.name, null, attributes);
                prevStep[INTERNAL].next = step;

                if (node.current) {
                    plan[INTERNAL].current = step;
                }

                if (Array.isArray(node.steps) && node.steps.length > 0) {
                    prevStep = readNodes(plan, step, node.steps);
                } else {
                    prevStep = step;
                }

            }

            prevStep[INTERNAL].endGroup = prevStep[INTERNAL].endGroup ? prevStep[INTERNAL].endGroup + 1 : 1;

            return prevStep;
        }

        const plan = new Plan();
        if (!Array.isArray(obj)) {
            throw new Error("Plan.fromObject() expects an array");
        }

        readNodes(plan, plan[INTERNAL].start, obj);

        return plan;
    }
}

module.exports = {Plan, Step, PLAN_STATE};
