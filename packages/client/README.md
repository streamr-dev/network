<p align="center">
  <a href="https://streamr.network">
    <img alt="Streamr" src="https://raw.githubusercontent.com/streamr-dev/network-monorepo/main/packages/client/readme-header-img.png" width="1320" />
  </a>
</p>

<h1 align="left">
  Streamr JavaScript Client
</h1>

[![Build status](https://github.com/streamr-dev/monorepo/actions/workflows/client-build.yml/badge.svg)](https://github.com/streamr-dev/monorepo/actions/workflows/client-build.yml)
![latest npm package version](https://img.shields.io/npm/v/streamr-client?label=latest)
[![GitHub stars](https://img.shields.io/github/stars/streamr-dev/network-monorepo?style=social)
[![Discord Chat](https://img.shields.io/discord/801574432350928907.svg?label=Discord&logo=Discord&colorB=7289da)](https://discord.gg/FVtAph9cvz)

This library allows you to easily interact with the [Streamr Network](https://streamr.network) from JavaScript-based environments, such as browsers and [node.js](https://nodejs.org). The library wraps a Streamr light node for publishing and subscribing to data, as well as contains convenience functions for creating and managing streams.

Please see the [Streamr project docs](https://streamr.network/docs) for more detailed documentation.

## Important information
> ⚠️ This section is to be removed before launch 

The current stable version of the Streamr Client is `5.x` (at the time of writing, February 2022) which is connected to the [Corea Network](https://streamr.network/roadmap). The Brubeck Network Streamr Client is the [6.0.0-beta.3](https://www.npmjs.com/package/streamr-client/v/6.0.0-beta.3) build along with the `testnet` builds of the Broker node. The developer experience of the two networks is the same, however, the `6.0.0-beta.3` client also runs as a light node in the network, whereas the `5.x` era client communicates remotely to a Streamr run node. When the Streamr Network transitions into the Brubeck era (ETA Jan/Feb 2022), data guarantees of `5.x` clients will need to be reassessed. Publishing data to the Brubeck network will only be visible in the [Brubeck Core UI](https://brubeck.streamr.network). The Marketplace, Core app and CLI tool are currently all configured to interact with the Corea Network only. Take care not to mix networks during this transition period.

---



## Get Started
Here are some usage examples. More examples can be found [here](https://github.com/streamr-dev/examples).

> In Streamr, Ethereum accounts are used for identity. You can generate an Ethereum private key using any Ethereum wallet, or you can use the utility function `StreamrClient.generateEthereumAccount()`, which returns the address and private key of a fresh Ethereum account.


### Subscribing to a stream
```js 

client.subscribe(STREAM_ID, (message) => {
    // handle for individual messages
})

```
### Creating & publishing to a stream
```js 
// Requires gas
const stream = await client.createStream({
    id: '/foo/bar'
})

await stream.publish({ timestamp: Date.now() })
```

## Quick Lookup (?)

### Creating a StreamrClient instance
```js
const client = new StreamrClient({
    auth: {
        privateKey: 'your-ethereum-private-key'
    }
})
```
> ℹ️ More `StreamrClient` creation options can be found in the [Client configuration](#client-configuration) section.



### Fetching existent streams
Getting an existent stream is pretty straight-forward
```js
const stream = await client.getStream(STREAM_ID)
```

The method `getOrCreateStream` allows for a seamless creation/fetching process:
```js
// May require gas upon stream creation
const stream = await client.getOrCreateStream({
    id: STREAM_ID
})
```

### Resending historical data

```js
const sub = await client.resend(
    STREAM_ID,
    resend: {
        last: 5,
    }, 
    (message) => {
        // This is the message handler which gets called for every received message in the stream.
        // Do something with the message here!
    }
)
```

See [Resend functionality with subscriptions](#resend-functionality-with-subscriptions) for resend options


### Resending data and storage
In order to  enable historical data `resends` add first the stream to a storage node:
```js
const { StreamrClient, STREAMR_STORAGE_NODE_GERMANY } = require('streamr-client')

await stream.addToStorageNode(STREAMR_STORAGE_NODE_GERMANY)
```
> ℹ️ Visit the [Storage section](#storage) for more options.

### Searching streams
You can search for streams using a portion of a string contained in it's stream id:
```js
const streams = await client.searchStreams('foo')
```

See (?) for more stream search options





___

## Setup

### Installation
The client is available on [npm](https://www.npmjs.com/package/streamr-client) and can be installed simply by:

```
npm install streamr-client
```

### Importing `streamr-client`
When using Node.js remember to import the library with:

```js
const { StreamrClient } = require('streamr-client')
```

For usage in the browser include the latest build, e.g. by including a `<script>` tag pointing at a CDN:

```html
<!-- for Brubeck package (6x) -->
<script src="https://unpkg.com/streamr-client@beta/streamr-client.web.js"></script>
```

>  To use with react please see [streamr-client-react](https://github.com/streamr-dev/streamr-client-react)

__
## The Streamr Client API

### Authentication
If you don't have an Ethereum account you can use the utility function [StreamrClient.generateEthereumAccount()](#utility-functions), which returns the address and private key of a fresh Ethereum account.

```js
const client = new StreamrClient({
    auth: {
        privateKey: 'your-private-key'
    }
})
```

Authenticating with an Ethereum private key contained in an Ethereum (web3) provider:

```js
const client = new StreamrClient({
    auth: {
        ethereum: window.ethereum,
    }
})
```

You can also create an anonymous client instance that will be allowed to interact with public streams:
```js
const client = new StreamrClient()
```


### Message ordering
If your use-case doesn't require message order to be enforced or if you want it to be tolerant to out-of-sync messages you can turn off the message ordering upon client creation:
```js
const client = new StreamrClient({
    auth: { ... },
    orderMessages: false,
    gapFill: false
})
```
Both of these flags should be disabled in tandem for message ordering to be properly turned off.

### Connecting

By default the client will automatically connect and disconnect as needed, ideally you should not need to manage connection state explicitly.


Specifically, it will automatically connect when you publish or subscribe, and automatically disconnect once all subscriptions are removed and no messages were recently published. This behaviour can be disabled using the `autoConnect` & `autoDisconnect` options when creating a `new StreamrClient`. Explicit calls to either `connect()` or `disconnect()` will disable all `autoConnect` & `autoDisconnect` functionality, but they can be re-enabled by calling `enableAutoConnect()` or `enableAutoDisconnect()`.

Calls that need a connection, such as `publish` or `subscribe` will fail with an error if you are disconnected and autoConnect is disabled.

```js
const client = new StreamrClient({
    auth: {
        privateKey: 'your-private-key'
    },
    autoConnect: false,
    autoDisconnect: false,
})

// Safely connects if not connected. Returns a promise. Resolves immediately if already connected. Only rejects if an error occurs during connection.    
await client.connect()

// Safely disconnects if not already disconnected, clearing all subscriptions. Returns a Promise.  Resolves immediately if already disconnected. Only rejects if an error occurs during disconnection.
await client.disconnect()
```


### Creating a stream 
```js
// Requires gas
const stream = await client.createStream({
    id: '/foo/bar'
})

console.log(stream.id) // `${address}/foo/bar`
```

### Subscribing to real-time events in a stream
The callback's first parameter, `payload`, will contain the value given to the `publish` method. The second parameter `streamrMessage` is of type StreamrObject. [You can read more about it here](../protocol/src/protocol/message_layer/StreamMessage.ts)
```js
// subscribing to a stream:
const subscription = await client.subscribe(
    STREAM_ID, 
    (payload, streamrMessage) => {
        console.log(payload) // the value passed to the publish method
        console.log(streamrMessage) // the complete StreamrObject sent
    }
)
```
Fetching all streams the client is subscribed to:
```js
const subscriptions = client.getSubscriptions()
```
Unsubscribing from an existent subscription:
```js
await client.unsubscribe(STREAM_ID)
// or, unsubscribe them all:
const streams = await client.unsubscribe()
```

### Publishing data points to a stream

```js
// Here's our example data point
const msg = {
    temperature: 25.4,
    humidity: 10,
    happy: true
}

// Publish using the stream id only
await client.publish(STREAM_ID, msg)

// The first argument can also be the stream object
await client.publish(stream, msg)

// Publish with a specific timestamp as a Date object (default is now)
await client.publish(STREAM_ID, msg, new Date(54365472))

// Publish with a specific timestamp in ms
await client.publish(STREAM_ID, msg, 54365472)

// Publish with a specific timestamp as a ISO8601 string
await client.publish(STREAM_ID, msg, '2019-01-01T00:00:00.123Z')

// Publish with a specific partition key (read more about partitioning further down this readme)
await client.publish(STREAM_ID, msg, Date.now(), 'my-partition-key')

// For convenience, stream.publish(...) equals client.publish(stream, ...)
await stream.publish(msg)
```

### Resend functionality with subscriptions
By default `subscribe` will not resend historical data, only subscribe to real time messages. In order to fetch historical messages the stream needs to have [storage enabled](#storage).

Note that only one of the resend options can be used for a particular subscription. The default functionality is to resend nothing, only subscribe to messages from the subscription moment onwards.

One can either fetch the historical sent messages with the `resend` method:
```js
// Fetches the last 10 messages stored for the stream
const resend1 = await client.resend({
    streamId: STREAM_ID,
    resend: {
        last: 10,
    }
}, messageCallback)
```

Or fetch them and subscribe to new messages in the same call via a `subscribe` call:
```js
// Fetches the last 10 messages and subscribes to the stream
const sub1 = await client.subscribe({
    streamId: STREAM_ID,
    resend: {
        last: 10,
    }
}, messageCallback)
```

Resend from a specific message reference up to the newest message:
```js
const sub2 = await client.subscribe({
    streamId: STREAM_ID,
    resend: {
        from: {
            timestamp: (Date.now() - 1000 * 60 * 5), // 5 minutes ago
        },
        publisher: PUBLISHER_ETHEREUM_ADDRESS, // optional
    }
}, onMessage)
```
Resend a limited range of messages:
```js
const sub3 = await client.subscribe({
    streamId: STREAM_ID,
    resend: {
        from: {
            timestamp: (Date.now() - 1000 * 60 * 10), // 10 minutes ago
        },
        to: {
            timestamp: (Date.now() - 1000 * 60 * 5), // 5 minutes ago
        },
        // when using from and to the following parameters are optional
        // but, if specified, both must be present
        publisher: PUBLISHER_ETHEREUM_ADDRESS, 
        msgChainId: 'ihuzetvg0c88ydd82z5o', 
    }
}, onMessage)
```
If you choose one of the above resend options when subscribing, you can listen on the completion of this resend by doing the following:

```js
const sub = await client.subscribe(options)
sub.onResent(() => {
    console.log('All caught up and received all requested historical messages! Now switching to real time!')
})
```

### Search Streams
You can query for the streams using an optional second parameter to fine-tune your search. A permission query searches over stream permissions. You can either query by direct permissions (which are explicitly granted to a user), or by all permissions (including public permissions, which apply to all users).

To get all streams where a user has some direct permission. The `user` option can be omitted. In that case, it defaults to the authenticated user:
```js 
const streams = await client.searchStreams('foo', {
    user: ETHEREUM_ADDRESS
})
// Or, to query for all the streams accessible by the user
const streams = await client.searchStreams('foo', {
    user: ETHEREUM_ADDRESS,
    allowPublic: true
})
```

It is also possible to filter by specific permissions by using `allOf` and `anyOf` flags. Please prefer `allOf` to `anyOf` when possible as it has better query performance.

If you want to find the streams you can exclusively subscribe to:
```js 
const streams = await client.searchStreams('foo', {
    user: ETHEREUM_ADDRESS,
    allOf: [StreamPermission.SUBSCRIBE],
})
```
If you want to find any streams you can publish to, regardless of the other permissions assigned:
```js
const streams = await client.searchStreams('foo', {
    user: ETHEREUM_ADDRESS,
    anyOf: [StreamPermission.PUBLISH],
})
```
The `allOf` method will return streams which permissions exactly match the provided array:
```js 
const streams = await client.searchStreams('foo', {
    allOf: [StreamPermission.SUBSCRIBE, StreamPermission.PUBLISH]
})
```
___
## The Stream Object API

### Deleting a stream
Deletes the stream from the on-chain registry:
```js
// Requires gas
await stream.delete()
```

### Updating a stream
```js
// Updates the properties of this stream object by sending them to the API
await stream.update()
```
### Stream Permissions

There are 5 different permissions:
- StreamPermission.PUBLISH
- StreamPermission.SUBSCRIBE
- StreamPermission.EDIT
- StreamPermission.DELETE
- StreamPermission.GRANT

For each stream + user there can be a permission assignment containing a subset of those permissions. It is also possible to grant public permissions for streams (only `StreamPermission.PUBLISH` and `StreamPermission.SUBSCRIBE`). If a stream has e.g. a public subscribe permissions, it means that anyone can subscribe to that stream.


To grant permissions for users:
```js
await stream.grantPermissions({
    user: address,
    permissions: [StreamPermission.PUBLISH],
})

// And for public streams:
await stream.grantPermissions({
    public: true,
    permissions: [StreamPermission.SUBSCRIBE]
})
```
And to revoke them:
```js
await stream.revokePermissions({
    user: address,
    permissions: [StreamPermission.PUBLISH]
})

// Or revoke public permissions:
await stream.revokePermissions({
    public: true,
    permissions: [StreamPermission.SUBSCRIBE]
})
```        


There is also method `client.setPermissions`. You can use it to set an exact set of permissions for one or more streams. Note that if there are existing permissions for the same users in a stream, the previous permissions are overwritten:

```js
await client.setPermissions({
    streamId,
    assignments: [
        {
            user: addressA,
            permissions: [StreamPermission.EDIT]
        }, {
            user: addressB,
            permissions: [StreamPermission.GRANT]
        }, {
            public: true,
            permissions: [StreamPermission.PUBLISH, StreamPermission.SUBSCRIBE]
        }
    ]
})
```

You can query the existence of a permission with `hasPermission()`. Usually you want to use `allowPublic: true` flag so that also the existence of a public permission is checked:
```js
await stream.hasPermission({
    permission: StreamPermission.PUBLISH,
    user,
    allowPublic: true
}
```

To query your own permissions:
```js
await stream.hasPermission({
    permission: StreamPermission.PUBLISH,
    user: await client.getAddress(),
    allowPublic: true
}
```

All streams permissions can be queried by calling `stream.getPermissions()`:
```js
const permissions = await stream.getPermissions()
```
The returned permissions are an array containing an item for each user, and one for public permissions:
```js
    permissions = [
        { user: '0x...', permissions: ['subscribe', 'publish'] },
        { public: true, permissions: ['subscribe']}
    ]
```


### Stream Partitioning

Partitioning (sharding) enables streams to scale horizontally. This section describes how to use partitioned streams via this library. To learn the basics of partitioning, see [the docs](https://streamr.network/docs/streams#partitioning).

#### Creating partitioned streams

By default, streams only have 1 partition when they are created. The partition count can be set to any positive number (max 100). An example of creating a partitioned stream using the JS client:

```js
// Requires gas
const stream = await client.createStream({
    id: `/partitioned-stream`,
    partitions: 10,
})
console.log(`Stream created: ${stream.id}. It has ${stream.partitions} partitions.`)
```

#### Publishing to partitioned streams

In most use cases, a user wants related events (e.g. events from a particular device) to be assigned to the same partition, so that the events retain a deterministic order and reach the same subscriber(s) to allow them to compute stateful aggregates correctly.

The library allows the user to choose a _partition key_, which simplifies publishing to partitioned streams by not requiring the user to assign a partition number explicitly. The same partition key always maps to the same partition. In an IoT use case, the device id can be used as partition key; in user interaction data it could be the user id, and so on.

The partition key can be given as an argument to the `publish` methods, and the library assigns a deterministic partition number automatically:

```js
// msg.vehicleId being the partition key
await client.publish(STREAM_ID, msg, Date.now(), msg.vehicleId)
// or, equivalently, using the stream object
await stream.publish(msg, Date.now(), msg.vehicleId)
```
You can also specify the partition number as the last parameter:
```js 
await client.publish(STREAM_ID, msg, Date.now(), 4)
// or, equivalently, using the stream object
await stream.publish(msg, Date.now(), 4)
```
Alternatively, you can specify the partition number as part of the stream id:
```js
await client.publish({
    id: `${address}/foo/bar`,
    partition: 4
}, msg, Date.now())
```

#### Subscribing to partitioned streams

By default, the JS client subscribes to the first partition (partition `0`) in a stream. This behavior will change in the future so that it will subscribe to all partitions by default.

The partition number can be explicitly given in the subscribe call:

```js
const sub = await client.subscribe({
    id: STREAM_ID,
    partition: 4
}, (payload) => {
    console.log('Got message %o', payload)
})
```

Or, to subscribe to multiple partitions, if the subscriber can handle the volume:

```js
const messageCallback = (payload, streamMessage) => {
    console.log('Got message %o from partition %d', payload, streamMessage.getStreamPartition())
}

await Promise.all([2, 3, 4].map(async (partition) => {
    await client.subscribe({
        id: STREAM_ID,
        partition,
    }, messageCallback)
}))
```


## Storage Options

You can enable data storage on your streams to retain historical data in one or more geographic locations of your choice and access it later via `resend`. By default storage is not enabled on streams. You can enable it with:

```js
const { StreamrClient, STREAMR_STORAGE_NODE_GERMANY } = require('streamr-client')
...
// assign a stream to storage
await stream.addToStorageNode(STREAMR_STORAGE_NODE_GERMANY)
// fetch the storage nodes for a stream
const storageNodes = stream.getStorageNodes()
// remove the stream from a storage node
await stream.removeFromStorageNode(STREAMR_STORAGE_NODE_GERMANY)
```
