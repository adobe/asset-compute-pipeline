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

//const debug = require('debug')('pipeline:planFinder');
const debug = console.log;
const Graph = require("graph-data-structure");

// holds private member fields
// const INTERNAL = Symbol("internal");

/**
 * TransformerGraph: wrapper around `graph-data-structure` library
 * 
 * See https://github.com/datavis-tech/graph-data-structure#api-reference for full api reference
 */
class TransformersGraph {
    constructor() {
        debug('new TransformerGraph()');
        this.graph = new Graph();
        this.intersections = {};
    }
    // custom methods
    /**
     * Graph looks like this:
        nodeA -> nodeB

        this.intersections = {
            nodeA: {
                nodeB: {
                    intersect: true,
                    intersectObject: {}
                }
            }
        }
    */
    /**
     * Adds a directed edge from nodeA to nodeB to the graph
     * Stores intersectObj for reference
     * 
     * Ex:
        this.addEdge(nodeA, nodeB);
        // graph looks like this: nodeA -> nodeB
        // intersections map looks like this:
        this.intersections = {
            nodeA: {
                nodeB: {
                    intersect: true,
                    intersectObject: {}
                }
            }
        }
     * @param {string} nodeA 
     * @param {string} nodeB 
     * @param {object} intersectObj 
     */
    addEdge(nodeA, nodeB, intersectObj) {
        if (!this.intersections[nodeA]) {
            this.intersections[nodeA] = {};
        }
        this.intersections[nodeA][nodeB] = {
            intersect: true,
            intersectObj: intersectObj
        };
        return this.graph.addEdge(nodeA, nodeB);
    }
    transformersIntersect(nodeA, nodeB) {
        return this.intersections[nodeA] && this.intersections[nodeA][nodeB] && this.intersections[nodeA][nodeB].intersect;
    }
    getIntersectionObject(nodeA, nodeB) {
        if (this.transformersIntersect(nodeA, nodeB)) {
            return this.intersections[nodeA][nodeB].intersectObj;
        }
    }
    getTransformers() {
        return this.graph.nodes();
    }
    // Bring in the rest of the methods used from `graph-data-structure`
    addNode(node) {
        return this.graph.addNode(node);
    }
    adjacent(node) {
        return this.graph.adjacent(node);
    }
    // for debug
    serialize(){
        return this.graph.serialize();
    }
}
module.exports = TransformersGraph;
