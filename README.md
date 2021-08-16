[![Version](https://img.shields.io/npm/v/@adobe/asset-compute-pipeline.svg)](https://npmjs.org/package/@adobe/asset-compute-pipeline)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](http://www.apache.org/licenses/LICENSE-2.0)
[![Build](https://github.com/adobe/asset-compute-pipeline/actions/workflows/node.js.yml/badge.svg)
# Asset Compute Pipeline

This library allows for managing pipelines that processes digital assets into renditions.

Components:
- Pipeline: overall system
- Orchestration: controls the flow
- Transformer: individual software components that can do a certain transformation or operation on an asset
- Plan: actual execution plan that might be passed around different components/services

## API details

### Transformers
Transformers are individual software components that can do a certain transformation or operation on an asset.

To create a new transformer, extend the transformer api:
```js
class TransformerExample extends Transformer {

    constructor() {
        super("transformerExample", new Manifest({
            inputs: {
                type: ["image/png"],
                width: { "min": 1, "max": 319},
                height: { "min": 1, "max": 319 },
                colorProfile: "rbg"
            },
            outputs: {
                type:  ["image/png", "image/png"]
            }
        }));
    }
    compute(input, output, options) {
        // ... convert input.path to output.path based on output.instructions
    }
}
```

#### Transformer.compute

The `compute` method is where you put your custom worker code. The basic expectation of this function is to look at parameters from `output.instructions` and convert it into a rendition, then write this rendition to `output.path`.

The parameters for the `compute` function are: `input`, `output`, and `options`.

Note: 
This function is backwards compatible with `renditionCallback` from the old SDK: https://github.com/adobe/asset-compute-sdk#rendition-callback-for-worker-required
The `compute` function does not need to return anything.

##### **`input`**
Object containing the following attributes:

| Name | Type | Description | Example |
|------|------|-------------|---------|
| `url` | `string` | URL pointing to the source binary. | `"http://example.com/image.jpg"`. Note: If transformer expects a local file, this may not be defined. |
| `path`| `string` |  Absolute path to local copy of source file | `"/tmp/image.jpg"`. Note: If transformer expects a non-local file, this may not be defined. |
| `name` | `string` | File name. File extension in the name might be used if no mime type can be detected. Takes precedence over filename in URL path or filename in content-disposition header of the binary resource. Defaults to "file". | `"image.jpg"` |
| `headers` | `object` | Object containining additional headers to use when doing a HTTP(S) request towards the `url` | `headers: { 'Authorization': 'auth-headers' }` |

##### **`output`**
Object containing the following attributes:

| Name | Type | Description |
|------|------|-------------|
| `instructions` | `object` | rendition parameters from the worker params (e.g. quality, dpi, format, height etc. See full list [here](https://docs.adobe.com/content/help/en/asset-compute/using/api.html#rendition-instructions) |
| `directory` | `string` | directory to put the renditions |
| `name` | `string` | filename of the rendition to create |
| `path` | `string` | Absolute path to store rendition locally (must put rendition here in order to be uploaded to cloud storage) |
| `index` | `number` | number used to identify a rendition |
| `target` | `array \| string` | list of presigned urls for uploading the final rendition. Note: if this is an intermediate rendition, there will not be target urls |

##### **`options`** 
Optional parameters to pass into workers

- `disableSourceDownload`: Boolean used to disable the source download (defaults to false). (keeping for backwards compatibility with the old SDK)
- `disableRenditionUpload`: Boolean used to disable the rendition upload (defaults to false). (keeping for backwards compatibility with the old SDK)
- any other options needed for the transformer (i.e. authorization. Pass `params.auth` into this options object)

#### Examples

At the bare minimum, the `compute` function must write something to the `output.path`.

Simplest example (copying the source file):

```js
async function compute(input, output) => {
    // Check for unsupported file
    const stats = await fs.stat(input.path);
    if (stats.size === 0) {
        throw new SourceUnsupportedError('source file is unsupported');
    }
    // process infile and write to outfile
    await fs.copyFile(input.path, output.path);
}
```

### Transformer Manifest

The manifest is a JSON object of attributes determining what the transformer supports as inputs and outputs. Every transformer must have a valid manifest containing at least the following:
- `inputs`: object containing at least the following attributes
  - type: string or array of strings containing the **mimetype/s** the transformer supports as input
  - sourceType: string containing value `URL` or `LOCAL` depending on what the transformer supports as input
- `outputs`
  - type: string or array of strings containing the **mimetype/s** the transformer supports producing an output

#### Manifest Rules
The manifest can have any number of other attributes in `inputs` and `outputs` that must follow these rules:
- attribute value can be defined as range (object), preference list (array), or singular item
- if attribute value is a range (object), it must be a valid number
- if attribute value is a preference list (array), it can be a list of numbers, strings or booleans
- if attribute value is a singular item, it can be a number, string or boolean
- empty array means you don't support it
- if an attribute is not listed, your transformer should accept it as an optional parameter and also have the option to ignore as well

#### Example
```
inputs: {
    type: ['image/tiff'],
    width: { min: 2000, max: 200000},
    height: { min: 2000, max: 200000 },
    alphaChannel: [],
    sourceType: "LOCAL"
},
outputs: {
    type: ['image/png', 'image/jpeg'],
    width: { min: 0, max: 2000},
    height: { min: 0, max: 2000 }
}
```

## Contributing
Contributions are welcomed! Read the [Contributing Guide](CONTRIBUTING.md) for more information.

## Licensing
This project is licensed under the Apache V2 License. See [LICENSE](LICENSE.md) for more information.
