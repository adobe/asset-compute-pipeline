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

const gm = require("./utils/gm-promisify");
const unitConvert = require("css-unit-converter");
const util = require('util');
const child_process = require('child_process');
const exec = util.promisify(child_process.exec);
const { GenericError, AssetComputeLogUtils, SourceCorruptError } = require('@adobe/asset-compute-commons');
const mime = require('mime-types');
const path = require('path');

const MEDIAINFO_TIMEOUT_MS = 30 * 1000; // max timeout of 30 seconds

// FFMPEG accepted formats list from here: https://git.corp.adobe.com/nui/core/blob/master/lib/workers.js
const FFMPEG_EXTS = new Set(["avi", "divx", "f4v", "flv", "m2t", "m2ts", "m2v", "m4v", "mkv", "mov", "mp4",
    "mpeg", "mpg", "mts", "ogv", "qt", "r3d", "webm", "wmv", "3gp", "mxf"
]);

// 3d formats which metadata tool cannot usually extract metadata from
const THREE_DIMENSIONAL_EXTS = new Set(["fbx", "glb", "usdz", "obj", "3ds"]);

// Text transcription service accepted formats list from here: https://git.corp.adobe.com/nui/core/blob/master/lib/workers.js
const TEXT_TRANSCRIPTION_EXTS = new Set(["mp4", "flv", "mxf", "mxf ", "wmv", "asf", "avi", "m4a", "m4v", "wav", "mov", "3gp", "mpg"]);

Object.filter = (obj, predicate) =>
    Object.keys(obj)
        .filter(key => predicate(obj[key]))
        // eslint-disable-next-line no-sequences
        .reduce((res, key) => (res[key] = obj[key], res), {});

/**
 * Class extracts the metadata out of an asset source.
 * Currently uses exiftool (with imagemagick as fallback) for image asset, and mediainfo for video and audio assets
 * After calling the extract() function, one should be able to retrieve asset metadata through the metadata getter.
 * Note that the extraction is only best effort, so some metadata might not present even after extraction
 * (ex. JPEGQualityEstimate for no-jpeg format asset)
 * Extracted Metadata:
 *      Image:
 *       - Orientation
 *       - FileType
 *       - ImageHeight
 *       - ImageWidth
 *       - JPEGQualityEstimate
 *      Video/Audio:
 *       - command
 *       - format
 *       - fileSize
 *       - duration
 *       - framerate
 *       - isTruncated
 *       - videoFormat          (video only)
 *       - videoFormatProfile   (video only)
 *       - width                (video only)
 *       - height               (video only)
 *       - aspectRatio          (video only)
*/
class Metadata {
    /**
     * @param {Object} source
     */
    constructor(source) {
        if (!source) {
            throw new GenericError(`No source provided`);
        } else if (!source.name && !source.path && !source.type) {
            throw new GenericError(`Provided source must contain one of 'name', 'path', or 'type' fields`);
        }
        this._source = source;

        this._extension = this.getExtension(this._source);
        if (!this._extension) {
            throw new GenericError(`Cannot determined asset extension`);
        }
    }

    async extract() {
        if (this._metadata) {
            console.warn('metadata has already been extracted');
            return;
        }
        if(this.is3dFormat()){
            // no additional metadata extraction for 3d formats
            // eslint-disable-next-line no-useless-return
            return Promise.resolve(null);
        } else if (this.isVideo() || this.isTextTranscriptable()) {
            let input = this._source.url;
            if (!input && this._source.path) {
                input = this._source.path;
            }
            if (!input) {
                throw new GenericError(`Image source must contain either 'url' or 'path' field to retrieve metadata`);
            }
            this._metadata = await this.getAudioVideoMediaMetadata(input);
        } else { // image asset
            if (!this._source.path) {
                throw new GenericError(`Image source must contain 'path' field to retrieve metadata`);
            }
            this._metadata = await this.getImageMetadata(this._source.path);
        }
    }

    get extension() {
        return this._extension;
    }

    get metadata() {
        if (!this._metadata) {
            console.warn('metadata can be retrieve only after extract function is called');
        }
        return this._metadata;
    }

    get source() {
        return this._source;
    }

    isVideo() {
        return FFMPEG_EXTS.has(this._extension);
    }

    isTextTranscriptable() {
        return TEXT_TRANSCRIPTION_EXTS.has(this._extension);
    }

    is3dFormat() {
        return THREE_DIMENSIONAL_EXTS.has(this._extension);
    }

    /**
     * Returns the source file extension
     */
    getExtension(source) {
        let ext;
        const assetName = source.name || source.path || source.url ;

        try {
            ext = path.extname(assetName).substring(1).toLowerCase();
        } catch (err) {
            ext = null;
            console.log(`Attempting to find extension failed with error: ${err.message || err}`);
        }

        if (!ext && source.type) {
            console.log(`Using type to find extension: ${source.type} to determine the extension`);
            ext = mime.extension(source.type) || "";
        }

        if (!ext) {
            return false;
        }

        return ext;
    }

    /**
     *
     * @param {String} url
     * @returns {Object} object containing video information:
     *
     * for example:
     *    {
     *       commandDuration: 1200 // in ms
     *       command: "mediainfo"
     *       width: 100,
     *       height: 200,
     *       aspectRatio: 1.677,
     *       codec: 'AVC',
     *       framerate: 25.000,
     *       bitrate: 1205959, // in bytes
     *       duration: 5.280 // in seconds
     *       ...
     *    }
     */
    async getAudioVideoMediaMetadata(url) {
        const start = Date.now();
        const metadata = await this.getMediaInfo(url);

        const mediainfoDuration = Date.now() - start;
        console.log(`mediainfo duration: ${mediainfoDuration}ms`);

        let metadataFiltered = {};

        // add command duration and name
        metadataFiltered.commandDuration = mediainfoDuration;
        metadataFiltered.command = "mediainfo";

        // add rest of metrics we need to examine
        for (const i in metadata) {
            if (metadata[i]["@type"] === "General") {
                let isTruncated;
                if (metadata[i].extra && metadata[i].extra.IsTruncated === 'Yes') {
                    isTruncated = true;
                } else {
                    isTruncated = false;
                }

                metadataFiltered = Object.assign(metadataFiltered, {
                    format: metadata[i].Format,
                    fileSize: parseInt(metadata[i].FileSize, 10),
                    duration: parseFloat(metadata[i].Duration),
                    framerate: parseFloat(metadata[i].FrameRate),
                    bitrate: parseInt(metadata[i].OverallBitRate, 10),
                    isTruncated: isTruncated
                });
            }

            if (metadata[i]["@type"] === "Video") {
                metadataFiltered = Object.assign(metadataFiltered, {
                    videoFormat: metadata[i].Format,
                    videoFormatProfile: metadata[i].Format_Profile,
                    width: parseInt(metadata[i].Width, 10),
                    height: parseInt(metadata[i].Height, 10),
                    aspectRatio: parseFloat(metadata[i].DisplayAspectRatio)
                });
            }
        }
        // remove NaN
        metadataFiltered = Object.filter(metadataFiltered, item => {
            if (typeof (item) === "number") {
                return !isNaN(item);
            }
            return true;
        });
        return metadataFiltered;
    }

    /**
     * Get metadata by calling MediaInfo with the source file
     * @param {*} url of file (path works too)
     * @returns {Object} raw metadata JSON object
     */
    async getMediaInfo(url) {
        if (!url || (typeof (url) !== "string")) {
            return {};
        }

        const command = `mediainfo --Output=JSON "${url}"`;

        let metadata = {};
        try {
            console.log(`Running command: mediainfo --Output=JSON "${AssetComputeLogUtils.redactUrl(url)}"`);
            const stdout = child_process.execSync(command, {
                timeout: MEDIAINFO_TIMEOUT_MS
            });
            metadata = JSON.parse(stdout).media.track;
        } catch (error) {
            console.error(`error getting metadata via mediainfo for source file: ${AssetComputeLogUtils.redactUrl(url)}`);
            console.error(error);
        }
        return metadata;  // returns default {} if no metadata found or error
    }

    async getImageMetadata(file) {
        let metadata = null;

        try {
            metadata = await this.getImageMetadataWithExifTool(file);
        } catch (e) {
            if (e.message && (e.message.includes("File format error") || e.message.includes("Unknown file type"))) {
                console.log(`Exiftool can't read metadata because it doesn't know the file format: ${e.message}`);
                // will throw source corrupt error if imagemagick fails
                return this.getImageMetadataWithImageMagick(file);
            }

            console.log(`Issue reading exif data: ${e}`);
            throw new SourceCorruptError(e.message);
        }

        return metadata;
    }

    async getImageMetadataWithExifTool(file) {
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
                delete metadata.SourceFile;
            }

            if(metadata){
                // normalization:
                // - convert units which are not in pixels to pixels
                // - deal with some formats being wrongly identified as XMP
                metadata = this.normalizeMetadata(metadata);
            }
        } catch (err) {
            throw new GenericError(`Reading metadata using exiftool failed with error ${err}`);
        }
        return metadata;
    }

    async getImageMetadataWithImageMagick(file) {
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
            // assume this means file is corrupt
            throw new SourceCorruptError(err.message);

        }

        return metadata;
    }

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
}

module.exports = Metadata;