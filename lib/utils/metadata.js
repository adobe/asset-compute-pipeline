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

const gm = require("./gm-promisify");
const unitConvert = require("css-unit-converter");
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const { GenericError } = require('@adobe/asset-compute-commons');

class Metadata {

    normalizeMetadata(metadata) {
        // unit conversions - SVG sizes may be in points (`pt`)
        if (typeof metadata.ImageHeight === "string") {
            metadata.ImageHeight = this.convertUnit(metadata.ImageHeight);
        }
      
        if (typeof metadata.ImageWidth === "string") {
            metadata.ImageWidth = this.convertUnit(metadata.ImageWidth);
        }
      
        if(metadata.FileType && metadata.FileType === "XMP"){
            /*
                exiftool gets an intermediate file which has some extension, as the worker 
                created an intermediate (test-worker does symlinks).
                SVG is a subset of XML, with a defined schema.
                So, exiftool, at the same time it looks at the intermediate rendition, it sees 
                that there is XML content and therefore infers it is XMP. 
                We know for sure this is wrong and in fact we have SVG, so we can fix the mistake...
            */
            // TODO Needs refactoring for a proper fix
            metadata.FileType = "SVG";
        }
      
        return metadata;
    }
    
    convertUnit(stringValueWithUnit) {
        let valueInPixels;
      
        // get value
        const numberMatcher = /(\d*\.?\d+)\s?(px|cm|mm|in|pt|pc)/ ;
        const result = stringValueWithUnit.match(numberMatcher);
        // get unit, if any (no unit means it's in pixels)
      
        // convert to pixels
        if(result && Array.isArray(result)){
            valueInPixels = unitConvert(result[1], result[2], 'px');
            valueInPixels = Math.round(valueInPixels);
        }
        console.log('Value converted to pixels:', valueInPixels);
        return valueInPixels;
    }
    
    static async readImageMetadata(file) {
        let metadata = null;
      
        try {
            metadata = await this.readImageMetadataWithExifTool(file);
        } catch (e) {
            if (e.stderr && e.stderr.includes("File format error")) {
                console.log("exiftool can't read metadata because it doesn't know the file format");
          
                metadata = await this.readImageMetadataWithImageMagick(file);
                if (metadata !== null){
                    return metadata;
                }
            }
        
            throw new GenericError(`Reading metadata from rendition failed: ${e.message}`);
        }
        return metadata;
    }
    
    async readImageMetadataWithExifTool(file) {
        let metadata = null;
      
        console.log("Reading metadata with exiftool");
        try {
            // To extract only metadata we need:
            const attributes = [
                "-Orientation",
                "-FileType",
                "-ImageHeight",
                "-ImageWidth",
                "-JPEGQualityEstimate"
            ];
            const attributesToExtract = attributes.join(" "); 
            const command = `exiftool -n -json ${attributesToExtract} ${file}`;
      
            // To get all metadata (even computed): 
            // const command = `exiftool -n -json -ee -api RequestAll=3 ${file}`;
            console.log(`Metadata (exiftool) command is: ${command}`);
        
            const { stdout } = await exec(command);
        
            metadata = JSON.parse(stdout); // exiftool outputs the json as string
            if (Array.isArray(metadata)) {
                metadata = metadata[0];
            }

            if(metadata){
                // normalization: 
                // - convert units which are not in pixels to pixels
                // - deal with some formats being wrongly identified as XMP
                metadata = this.normalizeMetadata(metadata);
            }
        } catch (err) {
            console.log(`Reading metadata using exiftool failed with error ${err}`);
        
            // remove anything that might have been added to the object
            metadata = null; 
        }
        return metadata;
    }
    
    async readImageMetadataWithImageMagick(file) {
        let metadata = null;
    
        console.log("Reading metadata with imagemagick");
        try {
            const result = await gm(`${file}[1x1+0+0]`).write("json:-");
            const json = JSON.parse(result.toString());

            let imageMagickMetadata = null;
            if (Array.isArray(json)) {
                imageMagickMetadata = json[0].image;
            } else {
                imageMagickMetadata = json.image;
            }

            if(imageMagickMetadata){
                metadata = {};
                metadata.FileType = imageMagickMetadata.format;
                metadata.Orientation = imageMagickMetadata.orientation;

                // at least we don't need unit conversion...
                metadata.ImageHeight = imageMagickMetadata.pageGeometry.height;
                metadata.ImageWidth = imageMagickMetadata.pageGeometry.width;
                metadata.JPEGQualityEstimate = imageMagickMetadata.quality;
            }
        } catch (err) {
            console.log(`Reading metadata using imagemagick failed with error ${err}`);
      
            // remove anything that might have been added to the object
            metadata = null; 
        }
    
        return metadata;
    }
}

module.exports = Metadata;