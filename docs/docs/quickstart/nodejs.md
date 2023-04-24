---
sidebar_position: 1
---

# NodeJS

This is a quickstart guide on creating your first stream using the Streamr JavaScript client in a NodeJS script.

**Prerequisites:**

- NPM v8 or greater
- NodeJS 16.13.x or greater
- A small amount of `MATIC` to pay for gas on Polygon mainnet. You can reachout to us on the #dev channel of [Discord](https://discord.gg/gZAm8P7hK8) for some tokens.

## Streamr client

The client is available on [NPM](https://www.npmjs.com/package/streamr-client) and can be installed simply with:

```shell
$ npm install streamr-client
```

Having trouble installing the client? Maybe our [troubleshooting](../usage/Streamr%20JS%20Client/how-to-use#Troubleshooting) section will help.

### Initialize the client

```ts
// Import the Streamr client
const StreamrClient = require('streamr-client');

// Initialize the client with an Ethereum account
const streamr = new StreamrClient({
  auth: {
    privateKey: 'ethereum-private-key',
  },
});
```

:::tip Key Point:
Ethereum accounts are used for authentication on Streamr.

You can generate an Ethereum private key using any Ethereum wallet, or you can use the utility function `StreamrClient.generateEthereumAccount()`, which returns the address and private key of a fresh Ethereum account.

**Learn more about [authentication](../usage/authenticate)**
:::

## Create the stream

A stream is simply a **sequence of data points in time**, i.e. an append only log. This is semantically equivalent to **topics** in traditional pub/sub networks.

```ts
// Requires MATIC tokens (Polygon blockchain gas token)
const stream = await streamr.createStream({
  id: '/foo/bar',
});

console.log(stream.id); // e.g. `0x123.../foo/bar`
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
});
```

### Set stream permissions

By default, the creator of the stream has full read, write and manage permissions over the stream, but if you'd like different addresses or public access controls to read and write (publish and subscribe) to your stream, then you'll need to add these permissions.

```ts
// Requires MATIC tokens (Polygon blockchain gas token)
await stream.grantPermissions({
  user: '0x12345...',
  permissions: [StreamPermission.PUBLISH],
});
```

:::tip Key Point:
**Learn more about setting stream permissions in [authenticate](../usage/authenticate).**
:::

## Publish data to the stream

You can either push data using the stream ID,

```ts
const msg = { hello: 'world' };
await streamr.publish(streamId, msg);
```

Or, by using the `stream` object,

```ts
const msg = { hello: 'world' };
const stream = await streamr.getStream(streamId);
await stream.publish(msg);
```

:::caution Important:
You must give `PUBLISH` permission to the address you have authenticated `StreamrClient` with **before** publishing data to the stream.

**Learn more about setting stream permissions in [authentication](../usage/authenticate).**
:::

## Subscribe to the stream

Just like publishing, you can either use the stream ID,

```ts
streamr.subscribe(streamId, (message) => {
  // handle for individual messages
});
```

Or, by using the `stream` object.

## Summary

Congrats! You've managed to create a stream and publish/subscribe data to it! 💪
