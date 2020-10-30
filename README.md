<p align="center">
  <a href="https://streamr.network">
    <img alt="Streamr" src="https://www.dropbox.com/s/39gw9e6dj8n0wzf/JS_Client.png?raw=1" width="1320" />
  </a>
</p>
<h1 align="left">
  Streamr JavaScript Client
</h1>


By using this client, you can easily interact with the [Streamr](https://streamr.network) API from JavaScript-based environments, such as browsers and [node.js](https://nodejs.org). You can, for example, subscribe to real-time data in Streams, produce new data to Streams, and create new Streams.

The client uses websockets for producing and consuming messages to/from streams. It should work in all modern browsers.

[![Build Status](https://travis-ci.com/streamr-dev/streamr-client-javascript.svg?branch=master)](https://travis-ci.com/streamr-dev/streamr-client-javascript)

[Installation](#installation) · [Usage](#usage) · [Client options](#client-options) · [Authentication options](#authentication-options) · [Message handler callback](#message-handler-callback) · [StreamrClient object](#streamrclient-object) · [Stream object](#stream-object) · [Subscription options](#subscription-options) · [Data Unions](#data-unions) · [Utility functions](#utility-functions) · [Events](#binding-to-events) · [Partitioning](#partitioning) · [Logging](#logging) · [NPM Publishing](#publishing-latest)

## Installation

The client is available on [npm](https://www.npmjs.com/package/streamr-client) and can be installed simply by:

`npm install streamr-client`

## Usage

Here are some quick examples. More detailed examples for the browser and node.js can be found [here](https://github.com/streamr-dev/streamr-client/tree/master/examples).

#### Creating a StreamrClient instance

```javascript
const client = new StreamrClient({
    auth: {
        privateKey: 'your-private-key'
    }
})
```

When using Node.js remember to require the library with:

```javascript
const StreamrClient = require('streamr-client')
```

#### Subscribing to real-time events in a stream

```javascript
const sub = client.subscribe(
    {
        stream: 'streamId',
        apiKey: 'secret',       // Optional. If not given, uses the apiKey given at client creation time.
        partition: 0,           // Optional, defaults to zero. Use for partitioned streams to select partition.
        // optional resend options here
    },
    (message, metadata) => {
        // This is the message handler which gets called for every incoming message in the Stream.
        // Do something with the message here!
    }
)
```

#### Resending historical data

```javascript
const sub = await client.resend(
    {
        stream: 'streamId',
        resend: {
            last: 5,
        },
    },
    (message) => {
        // This is the message handler which gets called for every received message in the Stream.
        // Do something with the message here!
    }
)
```

See "Subscription options" for resend options

#### Programmatically creating a Stream

```javascript
client.getOrCreateStream({
    name: 'My awesome Stream created via the API',
})
    .then((stream) => {
        console.log(`Stream ${stream.id} has been created!`)
        // Do something with the Stream, for example call stream.publish(message)
    })
```

#### Publishing data points to a Stream

```javascript
// Here's our example data point
const msg = {
    temperature: 25.4,
    humidity: 10,
    happy: true
}

// Publish using the Stream id only
client.publish('my-stream-id', msg)

// The first argument can also be the Stream object
client.publish(stream, msg)

// Publish with a specific timestamp as a Date object (default is now)
client.publish('my-stream-id', msg, new Date(54365472))

// Publish with a specific timestamp in ms
client.publish('my-stream-id', msg, 54365472)

// Publish with a specific timestamp as a ISO8601 string
client.publish('my-stream-id', msg, '2019-01-01T00:00:00.123Z')

// Publish with a specific partition key (read more about partitioning further down this readme)
client.publish('my-stream-id', msg, Date.now(), 'my-partition-key')

// For convenience, stream.publish(...) equals client.publish(stream, ...)
stream.publish(msg)
```

## Client options

| Option                   | Default value                   | Description                                                  |
| :------------------------ | :------------------------------- | :------------------------------------------------------------ |
| url                      | wss://streamr.network/api/v1/ws | Address of the Streamr websocket endpoint to connect to.     |
| restUrl                  | https://streamr.network/api/v1  | Base URL of the Streamr REST API.                            |
| auth                     | {}                              | Object that can contain different information to authenticate. More details below. |
| publishWithSignature     | 'auto'                          | Determines if data points published to streams are signed or not. Possible values are: 'auto', 'always' and 'never'. Signing requires `auth.privateKey` or `auth.provider`.  'auto' will sign only if one of them is set. 'always' will throw an exception if none of them is set. |
| verifySignatures         | 'auto'                          | Determines under which conditions signed and unsigned data points are accepted or rejected. 'always' accepts only signed and verified data points. 'never' accepts all data points. 'auto' verifies all signed data points before accepting them and accepts unsigned data points only for streams not supposed to contain signed data. |
| autoConnect              | true                            | If set to `true`, the client connects automatically on the first call to `subscribe()`. Otherwise an explicit call to `connect()` is required. |
| autoDisconnect           | true                            | If set to `true`, the client automatically disconnects when the last stream is unsubscribed. Otherwise the connection is left open and can be disconnected explicitly by calling `disconnect()`. |
| orderMessages            | true                            | If set to `true`, the subscriber handles messages in the correct order, requests missing messages and drops duplicates. Otherwise, the subscriber processes messages as they arrive without any check. |
| maxPublishQueueSize      | 10000                           | Only in effect when `autoConnect = true`. Controls the maximum number of messages to retain in internal queue when client has disconnected and is reconnecting to Streamr. |
| publisherGroupKeys       | {}                              | Object defining the group key as a hex string used to encrypt for each stream id. |
| publisherStoreKeyHistory | true                            | If `true`, the client will locally store every key used to encrypt messages at some point. If set to `false`, the client will not be able to answer subscribers asking for historical keys during resend requests. |
| subscriberGroupKeys      | {}                              | Object defining, for each stream id, an object containing the group key used to decrypt for each publisher id. Not needed if `keyExchange` is defined. |
| keyExchange              | {}                              | Defines RSA key pair to use for group key exchange. Can define `publicKey` and `privateKey` fields as strings in the PEM format, or stay empty to generate a key pair automatically. Can be set to `null` if no key exchange is required. |

## Authentication options

**Authenticating with an API key has been deprecated. Support for email/password authentication will be dropped in the future with authentication by cryptographic keys/wallets will be the only supported method of authentication.**

Authenticating with an Ethereum private key by cryptographically signing a challenge. Note the utility function `StreamrClient.generateEthereumAccount()`, which can be used to easily get the address and private key for a newly generated account. Authenticating with Ethereum also automatically creates an associated Streamr user, if it doesn't exist:

```javascript
new StreamrClient({
    auth: {
        privateKey: 'your-private-key'
    }
})
```

Authenticating with an Ethereum private key contained in an Ethereum (web3) provider:

```javascript
new StreamrClient({
    auth: {
        provider: web3.currentProvider,
    }
})
```

(Authenticating with an username and password, for internal use by the Streamr app):

```javascript
new StreamrClient({
    auth: {
        username: 'my@email.com',
        password: 'password'
    }
})
```

(Authenticating with a pre-existing session token, for internal use by the Streamr app):

```javascript
new StreamrClient({
    auth: {
        sessionToken: 'session-token'
    }
})
```

## Message handler callback

The second argument to `client.subscribe(options, callback)` is the callback function that will be called for each message as they arrive. Its arguments are as follows:

| Argument      | Description                                                  |
| :------------- | :------------------------------------------------------------ |
| payload       | A JS object containing the message payload itself            |
| streamMessage | The whole [StreamMessage](https://github.com/streamr-dev/streamr-client-protocol-js/blob/master/src/protocol/message_layer/StreamMessage.js) object containing various metadata, for example `streamMessage.getTimestamp()` etc. |

## StreamrClient object

#### Connecting

| Name                 | Description                                                  |
| :-------------------- | :------------------------------------------------------------ |
| connect()            | Connects to the server, and also subscribes to any streams for which `subscribe()` has been called before calling `connect()`. Returns a Promise. Rejects if already connected or connecting. |
| disconnect()         | Disconnects from the server, clearing all subscriptions. Returns a Promise.  Rejects if already disconnected or disconnecting. |
| pause()              | Disconnects from the server without clearing subscriptions.  |
| ensureConnected()    | Safely connects if not connected. Returns a promise. Resolves immediately if already connected. Only rejects if an error occurs during connection. |
| ensureDisconnected() | Safely disconnects if not disconnected. Returns a promise. Resolves immediately if already disconnected. Only rejects if an error occurs during disconnection. |

#### Managing subscriptions

| Name                         | Description                                                  |
| :---------------------------- | :------------------------------------------------------------ |
| subscribe(options, callback) | Subscribes to a stream. Messages in this stream are passed to the `callback` function. See below for subscription options. Returns a `Subscription` object. |
| unsubscribe(Subscription)    | Unsubscribes the given `Subscription`.                       |
| unsubscribeAll(`streamId`)   | Unsubscribes all `Subscriptions` for `streamId`.             |
| getSubscriptions(`streamId`) | Returns a list of `Subscriptions` for `streamId`.            |

#### Stream API

All the below functions return a Promise which gets resolved with the result. They can also take an `apiKey` as an extra argument. Otherwise the `apiKey` defined in the `StreamrClient` options is used, if any.

| Name                                                | Description                                                  |
| :--------------------------------------------------- | :------------------------------------------------------------ |
| getStream(streamId)                                 | Fetches a Stream object from the API.                        |
| listStreams(query)                                  | Fetches an array of Stream objects from the API. For the query params, consult the [API docs](https://api-explorer.streamr.com). |
| getStreamByName(name)                               | Fetches a Stream which exactly matches the given name.       |
| createStream(properties)                            | Creates a Stream with the given properties. For more information on the Stream properties, consult the [API docs](https://api-explorer.streamr.com). |
| getOrCreateStream(properties)                       | Gets a Stream with the id or name given in `properties`, or creates it if one is not found. |
| publish(streamId, message, timestamp, partitionKey) | Publishes a new message to the given Stream.                 |

#### Listening to state changes of the client

on(eventName, function) | Binds a `function` to an event called `eventName`
once(eventName, function) | Binds a `function` to an event called `eventName`. It gets called once and then removed.
removeListener(eventName, function) | Unbinds the `function` from events called `eventName`

## Stream object

All the below functions return a Promise which gets resolved with the result. They can also take an `apiKey` as an extra argument. Otherwise the `apiKey` defined in the `StreamrClient` options is used, if any.

| Name                                      | Description                                                  |
| :----------------------------------------- | :------------------------------------------------------------ |
| update()                                  | Updates the properties of this Stream object by sending them to the API. |
| delete()                                  | Deletes this Stream.                                         |
| getPermissions()                          | Returns the list of permissions for this Stream.             |
| hasPermission(operation, user)            | Returns a permission object, or null if no such permission was found. Valid `operation` values for streams are: stream_get, stream_edit, stream_delete, stream_publish, stream_subscribe, and stream_share. `user` is the username of a user, or null for public permissions. |
| grantPermission(operation, user)          | Grants the permission to do `operation` to `user`, which are defined as above. |
| revokePermission(permissionId)            | Revokes a permission identified by its `id`.                 |
| detectFields()                            | Updates the Stream field config (schema) to match the latest data point in the Stream. |
| publish(message, timestamp, partitionKey) | Publishes a new message to this Stream.                      |

## Subscription options

Note that only one of the resend options can be used for a particular subscription. The default functionality is to resend nothing, only subscribe to messages from the subscription moment onwards.

| Name      | Description                                                  |
| :--------- | :------------------------------------------------------------ |
| stream    | Stream id to subscribe to                                    |
| partition | Partition number to subscribe to. Defaults to partition 0.   |
| resend    | Object defining the resend options. Below are examples of its contents. |
| groupKeys | Object defining the group key as a hex string for each publisher id of the stream. |

```javascript
// Resend N most recent messages
resend: {
    last: 10,
}

// Resend from a specific message reference up to the newest message
resend: {
    from: {
        timestamp: 12345,
        sequenceNumber: 0, // optional
    }
    publisher: 'publisherId', // optional
    msgChainId: 'msgChainId', // optional
}

// Resend a limited range of messages
resend: {
    from: {
        timestamp: 12345,
        sequenceNumber: 0, // optional
    },
    to: {
        timestamp: 54321,
        sequenceNumber: 0, // optional
    },
    publisher: 'publisherId', // optional
    msgChainId: 'msgChainId', // optional
}
```

If you choose one of the above resend options when subscribing, you can listen on the completion of this resend by doing the following:

```javascript
const sub = client.subscribe(...)
sub.on('initial_resend_done', () => {
    console.log('All caught up and received all requested historical messages! Now switching to real time!')
})
```

## Data Unions

This library provides functions for working with Data Unions. All of the below methods return a Promise.

#### Admin functions

| Name                                                    | Returns     | Description                                                |
| :------------------------------------------------------- | :----------- | :---------------------------------------------------------- |
| deployDataUnion()                                       | Transaction | Deploy a new Data Union                                    |
| createSecret(dataUnionContractAddress, secret[, name])  |             | Create a secret for a Data Union                           |
| dataUnionIsReady(address)                               |             | Wait until a new Data Union is initialized by its Operator |
| addMembers(dataUnionContractAddress, memberAddressList) |             | Add members                                                |
| kick(dataUnionContractAddress, memberAddressList)       |             | Kick members out from Data Union                           |

```javascript
const dataUnion = await client.deployDataUnion()
dataUnion.address           // already available before deployment
await dataUnion.deployed()  // waits until contract is deployed
await dataUnion.isReady()   // waits until data union is operated
```

#### Member functions

| Name                                                         | Returns     | Description                                                  |
| :------------------------------------------------------------ | :----------- | :------------------------------------------------------------ |
| joinDataUnion(dataUnionContractAddress[, secret])            | JoinRequest | Join a Data Union                                            |
| hasJoined(dataUnionContractAddress[, memberAddress])         |             | Wait until member has been accepted                          |
| validateProof(dataUnionContractAddress, options)             | true/false  | Check that server is giving a proof that allows withdrawing  |
| withdraw(dataUnionContractAddress, options)                  | Receipt     | Withdraw funds from Data Union                               |
| withdrawFor(memberAddress, dataUnionContractAddress, options) | Receipt     | Pay for withdraw transaction on behalf of a Data Union member |
| withdrawTo(recipientAddress, dataUnionContractAddress, options) | Receipt     | Donate/move your earnings to recipientAddress instead of your memberAddress |

The options object for withdraw functions above may contain following overrides:

| Property      | Default   | Description                                                  |
| :------------- | :--------- | :------------------------------------------------------------ |
| wallet        | auth      | ethers.js Wallet object to use to sign and send withdraw transaction |
| provider      | mainnet   | ethers.js Provider to use if wallet wasn't provided          |
| confirmations | 1         | Number of blocks to wait after the withdraw transaction is mined |
| gasPrice      | ethers.js | Probably uses the network estimate                           |

#### Query functions

These are available for everyone and anyone, to query publicly available info from a Data Union:

| Name                                                      | Returns                           | Description                 |
| :--------------------------------------------------------- | :--------------------------------- | :--------------------------- |
| getMemberStats(dataUnionContractAddress[, memberAddress]) | {earnings, proof, ...}            | Get member's stats          |
| getDataUnionStats(dataUnionContractAddress)               | {memberCount, totalEarnings, ...} | Get Data Union's statistics |
| getMembers(dataUnionContractAddress)                      | [{address, earnings}, ...]        | Get Data Union's members    |

## Utility functions

| Name                                    | Description                                                  |
| :--------------------------------------- | :------------------------------------------------------------ |
| StreamrClient.generateEthereumAccount() | Generates a random Ethereum private key and returns an object with fields `address` and privateKey. Note that this private key can be used to authenticate to the Streamr API by passing it in the authentication options, as described earlier in this document. |

## Events

#### Binding to events

The client and the subscriptions can fire events as detailed below. You can bind to them using `on`:

```javascript
    // The StreamrClient emits various events
	client.on('connected', () => {
	    console.log('Yeah, we are connected now!')
	})

    // So does the Subscription object
	const sub = client.subscribe(...)
	sub.on('subscribed', () => {
	    console.log(`Subscribed to ${sub.streamId}`)
	})
```

#### Events on the StreamrClient instance

| Name         | Handler Arguments | Description                                           |
| :------------ | :----------------- | :----------------------------------------------------- |
| connected    |                   | Fired when the client has connected (or reconnected). |
| disconnected |                   | Fired when the client has disconnected (or paused).   |

#### Events on the Subscription object

| Name         | Handler Arguments                                            | Description                                                  |
| :------------ | :------------------------------------------------------------ | :------------------------------------------------------------ |
| subscribed   |                                                              | Fired when a subscription request is acknowledged by the server. |
| unsubscribed |                                                              | Fired when an unsubscription is acknowledged by the server.  |
| resending    | [ResendResponseResending](https://github.com/streamr-dev/streamr-client-protocol-js/blob/master/src/protocol/control_layer/resend_response_resending/ResendResponseResendingV1.js) | Fired when the subscription starts resending. Followed by the `resent` event to mark completion of the resend after resent messages have been processed by the message handler function. |
| resent       | [ResendResponseResent](https://github.com/streamr-dev/streamr-client-protocol-js/blob/master/src/protocol/control_layer/resend_response_resent/ResendResponseResentV1.js) | Fired after `resending` when the subscription has finished resending. |
| no_resend    | [ResendResponseNoResend](https://github.com/streamr-dev/streamr-client-protocol-js/blob/master/src/protocol/control_layer/resend_response_no_resend/ResendResponseNoResendV1.js) | This will occur instead of the `resending` - `resent` sequence in case there were no messages to resend. |
| error        | Error object                                                 | Reports errors, for example problems with message content    |

## Partitioning

Partitioning (sharding) enables streams to scale horizontally. This section describes how to use partitioned streams via this library. To learn the basics of partitioning, see [the docs](https://streamr.network/docs/streams#partitioning).

#### Creating partitioned streams

By default, streams only have 1 partition when they are created. The partition count can be set to any positive number (1-100 is reasonable). An example of creating a partitioned stream using the JS client:

```javascript
client.createStream({
    name: 'My partitioned stream',
    partitions: 10,
}).then(stream => {
    console.log(`Stream created: ${stream.id}. It has ${stream.partitions} partitions.`)
})
```

#### Publishing to partitioned streams

In most use cases, a user wants related events (e.g. events from a particular device) to be assigned to the same partition, so that the events retain a deterministic order and reach the same subscriber(s) to allow them to compute stateful aggregates correctly.

The library allows the user to choose a *partition key*, which simplifies publishing to partitioned streams by not requiring the user to assign a partition number explicitly. The same partition key always maps to the same partition. In an IoT use case, the device id can be used as partition key; in user interaction data it could be the user id, and so on.

The partition key can be given as an argument to the `publish` methods, and the library assigns a deterministic partition number automatically:

```javascript
client.publish('my-stream-id', msg, Date.now(), msg.vehicleId)

// or, equivalently
stream.publish(msg, Date.now(), msg.vehicleId)
```

#### Subscribing to partitioned streams

By default, the JS client subscribes to the first partition (partition `0`) in a stream. The partition number can be explicitly given in the subscribe call:

```javascript
client.subscribe(
    {
        stream: 'my-stream-id',
        partition: 4, // defaults to 0
    },
    (payload) => {
        console.log(`Got message ${JSON.stringify(payload)}`)
    },
)
```

Or, to subscribe to multiple partitions, if the subscriber can handle the volume:

```javascript
const handler = (payload, streamMessage) => {
    console.log(`Got message ${JSON.stringify(payload)} from partition ${streamMessage.getStreamPartition()}`)
}

[2,3,4].forEach(partition => {
    client.subscribe(
        {
            stream: 'my-stream-id',
            partition: partition,
        },
        handler,
    )
})
```

## Logging

The Streamr JS client library supports [debug](https://github.com/visionmedia/debug) for logging.

In node.js, start your app like this: `DEBUG=StreamrClient* node your-app.js`

In the browser, include `debug.js` and set `localStorage.debug = 'StreamrClient'`


## Publishing

Publishing to NPM is automated via Github Actions. Follow the steps below to publish `latest` or `beta`.

#### Publishing `latest`:

1. Update version with either `npm version [patch|minor|major]`. Use semantic versioning
   https://semver.org/. Files package.json and package-lock.json will be automatically updated, and an appropriate git commit and tag created.
2. `git push --follow-tags`
3. Wait for Github Actions to run tests
4. If tests passed, Github Actions will publish the new version to NPM

#### Publishing `beta`:

1. Update version with either `npm version [prepatch|preminor|premajor] --preid=beta`. Use semantic versioning
   https://semver.org/. Files package.json and package-lock.json will be automatically updated, and an appropriate git commit and tag created.
2. `git push --follow-tags`
3. Wait for Github Actions to run tests
4. If tests passed, Github Actions will publish the new version to NPM
