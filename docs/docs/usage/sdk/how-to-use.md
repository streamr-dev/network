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

#### Node.js
Node.js `20` is the minimum required version, ideally version 22 and later. Node.js, NPM `10` and later versions are recommended.

#### Browser (Website/WebApps)
For usage in the browser include the latest build, e.g. by including a `<script>` tag pointing at a CDN:

```html
<script src="https://unpkg.com/@streamr/sdk/exports-umd.js"></script>
```

#### Browser extension
Due to the stricter security rules inside browser extensions you must use the web build version of the Streamr SDK.

#### React Native
We are actively working on React Native compatibility but currently the Streamr SDK is not compatible with React Native. To connect, pull or push data into the Streamr Network, use the [Streamr node integration pattern](../connect-apps-and-iot/streamr-node-interface.md).

#### Webpack

Install the SDK and a Webpack polyfill plugin such as `node-polyfill-webpack-plugin`.

```bash
npm i @streamr/sdk node-polyfill-webpack-plugin
```

Then use the plugin in your `webpack.config.js`:

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

#### Next.js

The Next.js workflow closely resembles the Webpack workflow mentioned above but requires a bit more setup. To get started, install the SDK along with a Webpack polyfill plugin, such as `node-polyfill-webpack-plugin`.

```bash
npm i @streamr/sdk node-polyfill-webpack-plugin
```

Then, update `next.config.js` to include the plugin and apply a few manual patches:

```ts
import type { NextConfig } from 'next'
import NodePolyfillPlugin from 'node-polyfill-webpack-plugin'

const nextConfig: NextConfig = {
    webpack: (config) => {
        // …

        config.plugins.push(new NodePolyfillPlugin())

        config.resolve.alias.pino = 'pino/browser'

        config.externals.push({
            'node-datachannel': 'commonjs node-datachannel',
        })

        return config
    },
}

export default nextConfig
```

#### Vite

To use the SDK with Vite.js, you'll need a polyfill plugin like `vite-plugin-node-polyfills`. Start by installing both the SDK and the plugin:

```bash
npm i @streamr/sdk
npm i -D vite-plugin-node-polyfills
```

Next, update `vite.config.js` to include the plugin:

```ts
import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
    plugins: [
        // …
        nodePolyfills()
    ],
})
```

And that's it — you're all set!

#### GatsbyJS

Gatsby.js follows a similar approach to Next.js when integrating the SDK. First, install a polyfill plugin like `node-polyfill-webpack-plugin` along with the SDK:

```bash
npm i @streamr/sdk node-polyfill-webpack-plugin
```

Next, create or update `gatsby-node.ts` to include the plugin:

```ts
import type { GatsbyNode } from 'gatsby'
import NodePolyfillPlugin from 'node-polyfill-webpack-plugin'

export const onCreateWebpackConfig: GatsbyNode['onCreateWebpackConfig'] =
    async ({ stage, actions, loaders }) => {
        if (stage === 'build-html' || stage === 'develop-html') {
            actions.setWebpackConfig({
                module: {
                    rules: [
                        {
                            test: /node-forge|sqlite3|@lit-protocol/,
                            use: loaders.null(),
                        },
                    ],
                },
            })
        }

        actions.setWebpackConfig({
            resolve: {
                alias: {
                    pino: 'pino/browser',
                },
            },
            externals: [
                {
                    'node-datachannel': 'commonjs node-datachannel',
                },
            ],
            plugins: [
                new NodePolyfillPlugin({
                    additionalAliases: ['process'],
                }),
            ],
        })
    }
```

With that, your SDK setup for Gatsby.js is complete!


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
