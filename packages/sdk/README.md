<p align="center">
  <a href="https://streamr.network">
    <img alt="Streamr" src="https://raw.githubusercontent.com/streamr-dev/network/main/packages/sdk/readme-header.png" width="600" />
  </a>
</p>

<h1 align="left">
  Streamr TypeScript SDK
</h1>

![latest npm package version](https://img.shields.io/npm/v/@streamr/sdk?label=latest)
![GitHub stars](https://img.shields.io/github/stars/streamr-dev/network?style=social)
[![Discord Chat](https://img.shields.io/discord/801574432350928907.svg?label=Discord&logo=Discord&colorB=7289da)](https://discord.gg/FVtAph9cvz)

The Streamr SDK allows you to interact with the [Streamr Network](https://streamr.network) from JavaScript-based environments, such as browsers and [Node.js](https://nodejs.org). This library contains convenience functions for creating and managing streams on the Streamr Network.

**[Checkout our documentation](https://docs.streamr.network) for the full usage instructions.**

## Quickstart
The SDK is available on [NPM](https://www.npmjs.com/package/@streamr/sdk) and can be installed simply by:

```
npm install @streamr/sdk
```

If using TypeScript you can import the library with:
```js
import { StreamrClient } from '@streamr/sdk'
```
If using Node.js you can import the library with:

```js
const { StreamrClient } = require('@streamr/sdk')
```

## Environments and frameworks
The Streamr SDK is built for the browser and Node.js environments. 

**Node.js**
- Node.js `20`, NPM `10` and later versions are recommended.

**Browser (Website/WebApps)**
- For usage in the browser include the latest build, e.g. by including a `<script>` tag pointing at a CDN:
- `<script src="https://unpkg.com/@streamr/sdk@latest/exports-umd.min.js"></script>`
- To use within React, please see [streamr-client-react](https://github.com/streamr-dev/streamr-client-react)

**Browser extension**
- Due to the stricter security rules inside browser extensions you must use the web build version of the Streamr SDK.

## Usage

### Full API reference
For a full API reference visit https://docs.streamr.network/usage/sdk/api/.

### Identity
In Streamr, cryptographic keys establish identity. Various types of key pairs and algorithms are supported, for example Ethereum private keys. Read more about [Identity](https://docs.streamr.network/usage/identity). Providing a key is not required if you are subscribing to public streams on the Network.

```js
const streamr = new StreamrClient({
    auth: {
        privateKey: 'ethereum-private-key'
    }
})
```

Authenticating with an Ethereum private key contained in an Ethereum (web3) provider (e.g. MetaMask):
```js
const streamr = new StreamrClient({
    auth: {
        ethereum: window.ethereum,
    }
})
```

You can also create an anonymous client instance that can interact with public streams:
```js
const streamr = new StreamrClient()
```

### Creating a stream
```js
// Requires POL tokens (Polygon blockchain gas token)
const stream = await streamr.createStream({
    id: '/foo/bar'
})

console.log(stream.id) // e.g. `0x12345.../foo/bar`
```

### Subscribing
```js
const streamId = 'streams.dimo.eth/firehose/weather'

streamr.subscribe(streamId, (message) => {
    // handle for individual messages
})

```
### Publishing
Publishing messages requires your Ethereum account to have permission to publish. See the [stream permission docs](https://docs.streamr.network/usage/streams/permissions) for more information.

```js
// Requires POL tokens (Polygon blockchain gas token)
const stream = await streamr.createStream({
    id: '/foo/bar'
})

await stream.publish({ timestamp: Date.now() })
```

### Requesting historical messages
By default `subscribe` will not request historical messages.

You can fetch historical messages with the `resend` method:
```js
streamr.resend(streamId, { last: 10 }, (msgs) => {
  console.log("messages": msgs);
});
```

___

**This Readme only scratches the surface of what's possible - be sure to [checkout our documentation](https://docs.streamr.network) for the full usage instructions.**
