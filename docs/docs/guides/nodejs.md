---
sidebar_position: 1
---

# Pub/Sub in NodeJS
This is a quickstart guide on creating your first stream using the Streamr TypeScript SDK in a NodeJS script.

**Prerequisites:**
-   NPM v10 or greater
-   NodeJS 20.x or greater (version 22 and later ideally)
-   A small amount of `POL` to pay for gas on Polygon mainnet. You can reachout to us on the #dev channel of [Discord](https://discord.gg/gZAm8P7hK8) for some tokens.

:::tip Key Point:
If you'd like to test out Streamr without needing `POL` to pay for stream creation and access control transactions then you can configure any Streamr app or node to be on Polygon Amoy. 

Note that streams that are registered on one chain, cannot see or interact with streams on another chain (including the stream mentioned in this guide). 

Checkout our [Polygon Amoy testnet configuration](../usage/configuration.md#polygon-amoy-testnet) for more details.
:::

## Streamr SDK
The Streamr SDK is available on [NPM](https://www.npmjs.com/package/@streamr/node) and can be installed simply with:

```shell
$ npm install @streamr/sdk
```

Having trouble installing the SDK? Maybe our [troubleshooting](../usage/sdk/how-to-use#Troubleshooting) section will help.

### Initialize the SDK
```ts
// Import Streamr
const { StreamrClient } = require('@streamr/sdk')

// Initialize the client with an Ethereum account
const streamr = new StreamrClient({
    auth: {
        privateKey: "ethereum-private-key",
    },
})
```

:::tip Key Point:
User identity on Streamr is established via cryptographic keys. An Ethereum account, defined by a private key, is one type of supported identity on Streamr. The private key can be generated with any Ethereum wallet or with tools included in the SDK. 

**Learn more about [Identity](../usage/identity.md) on Streamr.**
:::

## Create the stream
A stream is simply a **sequence of data points in time**, i.e. an append only log. This is semantically equivalent to **topics** in traditional pub/sub networks.

```ts
// Requires POL tokens (Polygon blockchain gas token)
const stream = await streamr.createStream({
    id: "/foo/bar",
})

console.log(stream.id) // e.g. `0x123.../foo/bar`
```

We have created a stream with a stream ID that resembles `0x123.../foo/bar`. The 0x address is your Ethereum account's public address and `/foo/bar` has been added to the end.

:::tip Key Point:
Take care to not mix up `stream` with `streamr`!

**Learn more about [streams](../usage/streams/creating-streams)**
:::

Alternatively, you can use `getOrCreateStream` to use an existing stream.

```ts
const stream = await streamr.getOrCreateStream({
    id: streamId,
})
```

### Set stream permissions
By default, the creator of the stream has full read, write and manage permissions over the stream, but if you'd like different addresses or public access controls to read and write (publish and subscribe) to your stream, then you'll need to add these permissions.

```ts
// Requires POL tokens (Polygon blockchain gas token)
await stream.grantPermissions({
    userId: "0x12345...",
    permissions: [StreamPermission.PUBLISH],
})
```

:::tip Key Point:
**Learn more about [Identity](../usage/identity.md) or [Stream Permissions](../usage/streams/permissions.md).**
:::

## Publish data to the stream
You can either push data using the stream ID,

```ts
const msg = { hello: "world" }
await streamr.publish(streamId, msg)
```

Or, by using the `stream` object,

```ts
const msg = { hello: "world" }
const stream = await streamr.getStream(streamId)
await stream.publish(msg)
```

:::caution Important:
You must give `PUBLISH` permission to the identity you have authenticated `StreamrClient` with **before** publishing data to the stream.

**Learn more about [Identity](../usage/identity.md) or [Stream Permissions](../usage/streams/permissions.md).**
:::

## Subscribe to the stream
Just like publishing, you can either use the stream ID,

```ts
streamr.subscribe(streamId, (message) => {
    // handle for individual messages
})
```

Or, by using the `stream` object.

## Summary
Congrats! You've managed to create a stream and publish/subscribe data to it! 💪
