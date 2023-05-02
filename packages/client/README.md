<p align="center">
  <a href="https://streamr.network">
    <img alt="Streamr" src="https://raw.githubusercontent.com/streamr-dev/network-monorepo/main/packages/client/readme-header.png" width="600" />
  </a>
</p>

<h1 align="left">
  Streamr JavaScript Client
</h1>

![latest npm package version](https://img.shields.io/npm/v/streamr-client?label=latest)
![GitHub stars](https://img.shields.io/github/stars/streamr-dev/network-monorepo?style=social)
[![Discord Chat](https://img.shields.io/discord/801574432350928907.svg?label=Discord&logo=Discord&colorB=7289da)](https://discord.gg/FVtAph9cvz)

The Streamr Client library allows you to easily interact with the [Streamr Network](https://streamr.network) from
JavaScript-based environments, such as browsers and [Node.js](https://nodejs.org). The library wraps a Streamr light node for publishing and subscribing to messages. It also contains convenience functions for creating and managing streams.

**[Checkout our documentation](https://docs.streamr.network) for the full usage instructions.**

## Quickstart
The client is available on [NPM](https://www.npmjs.com/package/streamr-client) and can be installed simply by:

```
npm install streamr-client
```

If using TypeScript you can import the library with:
```js
import { StreamrClient } from 'streamr-client'
```
If using Node.js you can import the library with:

```js
const { StreamrClient } = require('streamr-client')
```

## Environments and frameworks
**NodeJS**
- NodeJS `16.13.x` is the minimum required version. NodeJS `18.13.x`, NPM `8.x` and later versions are recommended.

**Browser (Website/WebApps)**
- To use with react please see [streamr-client-react](https://github.com/streamr-dev/streamr-client-react)
- For usage in the browser include the latest build, e.g. by including a `<script>` tag pointing at a CDN:
- `<script src="https://unpkg.com/streamr-client@latest/streamr-client.web.min.js"></script>`

**Browser extension**
- Due to the stricter security rules inside browser extensions you must use the web build version of the Streamr Client.

## Usage

### Full API reference
For a full API reference visit https://api-docs.streamr.network/.

### Client creation
In Streamr, Ethereum accounts are used for identity. You can generate an Ethereum private key using any Ethereum wallet, or you can use the utility function [`StreamrClient.generateEthereumAccount()`](#utility-functions), which returns the address and private key of a fresh Ethereum account. A private key is not required if you are only subscribing to public streams on the Network.

```js
const streamr = new StreamrClient({
    auth: {
        privateKey: 'your-private-key'
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
// Requires MATIC tokens (Polygon blockchain gas token)
const stream = await streamr.createStream({
    id: '/foo/bar'
})

console.log(stream.id) // e.g. `0x12345.../foo/bar`
```

### Subscribing
```js
const streamId = '0x7d275b79eaed6b00eb1fe7e1174c1c6f2e711283/ethereum/gas-price'

streamr.subscribe(streamId, (message) => {
    // handle for individual messages
})

```
### Publishing
Publishing messages requires your Ethereum account to have permission to publish. See the [stream permission docs](https://docs.streamr.network/usage/streams/permissions) for more information.

```js
// Requires MATIC tokens (Polygon blockchain gas token)
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
