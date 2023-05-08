---
sidebar_position: 1
---

# How to use

The Streamr Client, i.e. the Light node is the main JS client for interacting with the Streamr Network. It should be installed as part of your application where possible. The Client is also used inside the Streamr Broker and CLI tools.

<!-- TODO explainer on what the client is, and how it fits into the network. API ref and so on. Link to Streams section. -->

## Setup

The client is available on [npm](https://www.npmjs.com/package/streamr-client) and can be installed simply by:

```
npm install streamr-client
```

### Importing streamr-client

To use with react please see [streamr-client-react](https://github.com/streamr-dev/streamr-client-react)

If using TypeScript you can import the library with:

```js
import { StreamrClient } from 'streamr-client';
```

If using Node.js you can import the library with:

```js
const { StreamrClient } = require('streamr-client');
```

### Environments and frameworks

#### NodeJS

NodeJS `16.13.x` is the minimum required version. NodeJS `18.13.x`, NPM `8.x` and later versions are recommended.

#### Browser (Website/WebApps)

For usage in the browser include the latest build, e.g. by including a `<script>` tag pointing at a CDN:

```html
<script src="https://unpkg.com/streamr-client@latest/streamr-client.web.js"></script>
```

#### Browser extension

Due to the stricter security rules inside browser extensions you must use the web build version of the Streamr Client.

#### React Native

We are actively working on React Native compatibility but currently the Streamr JavaScript Client is not compatible with React Native. To connect, pull or push data into the Streamr Network, use the [Broker integration pattern](https://streamr.network/docs/streamr-network/connecting-applications).

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

Run `npm install streamr-client` in your project folder
