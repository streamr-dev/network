---
sidebar_position: 1
---

# How to use
The Streamr SDK, is the main TypeScript library for interacting with the Streamr Network. It should be installed as part of your application where possible. The SDK is also used inside the Streamr node and the Streamr CLI tool.

<!-- TODO explainer on what the SDK is, and how it fits into the network. API ref and so on. Link to Streams section. -->

## Setup
The SDK is available on [npm](https://www.npmjs.com/package/@streamr/sdk) and can be installed simply by:

```
npm install @streamr/sdk
```

### Importing streamr-client
To use with react please see [streamr-client-react](https://github.com/streamr-dev/streamr-client-react)

If using TypeScript you can import the library with:

```js
import { StreamrClient } from '@streamr/sdk';
```

If using Node.js you can import the library with:

```js
const { StreamrClient } = require('@streamr/sdk');
```

### Environments and frameworks

#### NodeJS
NodeJS `18.13.x` is the minimum required version, ideally version 20 and later. NodeJS, NPM `8.x` and later versions are recommended.

#### Browser (Website/WebApps)
For usage in the browser include the latest build, e.g. by including a `<script>` tag pointing at a CDN:

```html
<script src="https://unpkg.com/@streamr/sdk/streamr-sdk.web.js"></script>
```

#### Browser extension
Due to the stricter security rules inside browser extensions you must use the web build version of the Streamr SDK.

#### React Native
We are actively working on React Native compatibility but currently the Streamr SDK is not compatible with React Native. To connect, pull or push data into the Streamr Network, use the [Streamr node integration pattern](../connect-apps-and-iot/streamr-node-interface.md).

#### Webpack

Install the SDK and a Webpack polyfill plugin library, like `node-polyfill-webpack-plugin`.

```bash
npm i @streamr/sdk node-polyfill-webpack-plugin
```

Then use the polyfill plugin in your `webpack.config.js`:

```ts
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin')

module.exports = {
    // …
    plugins: [
        // …
        new NodePolyfillPlugin({ additionalAliases: ['process'] })
    ]
}
```

## Troubleshooting

When on mac, you might run into the problem of not having **cmake** and/or **openssl** installed and configured.

Follow these steps to solve these problems:

### cmake is not installed on mac:
Open your terminal and run

```shell
$ brew install cmake
```

### OpenSSL is not installed and configured on mac

Open your terminal and run

```shell
$ brew install openssl
```

Then cd into your root directory

```shell
$ cd ~
```

Create a file named .zshrc to create environment variables for your terminal.

```shell
$ nano .zshrc
```

Add the following lines to the file:

```
export OPENSSL_CRYPTO_LIBRARY="/opt/homebrew/opt/openssl@1.1"
export OPENSSL_INCLUDE_DIR="/opt/homebrew/opt/openssl@1.1"
export OPENSSL_ROOT_DIR="/opt/homebrew/opt/openssl@1.1"
```

Make sure to restart your terminal as the system variables then reload into your zsh terminal

Run `npm install @streamr/sdk` in your project folder
