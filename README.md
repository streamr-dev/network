<p align="center">
  <a href="https://streamr.network">
    <img alt="Streamr" src="https://raw.githubusercontent.com/streamr-dev/streamr-client-javascript/master/readme-header-img.png" width="1320" />
  </a>
</p>
<h1 align="left">
  Streamr JavaScript Client
</h1>

![Build Status](https://img.shields.io/github/workflow/status/streamr-dev/streamr-client-javascript/Test%20Build/master)
[![GitHub release](https://img.shields.io/github/release/streamr-dev/streamr-client-javascript.svg?style=flat)](https://github.com/streamr-dev/streamr-client-javascript/releases/)
[![GitHub stars](https://img.shields.io/github/stars/streamr-dev/streamr-client-javascript.svg?style=flat&label=Star&maxAge=2592000)](https://github.com/streamr-dev/streamr-client-javascript/)
[![Discord Chat](https://img.shields.io/discord/801574432350928907.svg?label=Discord&logo=Discord&colorB=7289da)](https://discord.gg/FVtAph9cvz)

By using this client, you can easily interact with the [Streamr](https://streamr.network) API from JavaScript-based environments, such as browsers and [node.js](https://nodejs.org). You can, for example, subscribe to real-time data in streams, produce new data to streams, and create new streams. The client uses websockets for producing and consuming messages to/from streams. It should work in all modern browsers.

Please see the [API Docs](https://streamr-dev.github.io/streamr-client-javascript/) for more detailed documentation.


### Breaking changes notice

* Date TBD: Support for unsigned data will be dropped.

----

## TOC

[Installation](#installation) · [Usage](#usage) · [API Docs](#API-docs) · [Client options](#client-options) · [Authentication](#authentication-options) · [Managing subscriptions](#managing-subscriptions) · [Stream API](#stream-api) · [Subscription options](#subscription-options) · [Data Unions](#data-unions) · [Utility functions](#utility-functions) · [Events](#events) · [Stream Partitioning](#stream-partitioning) · [Logging](#logging) · [NPM Publishing](#publishing-latest)


## Installation

The client is available on [npm](https://www.npmjs.com/package/streamr-client) and can be installed simply by:

```
npm install streamr-client
```

Node v14 or higher is recommended if you intend to use the client in a Node environment. For example, inside a script.

## Usage

Here are some quick examples. More detailed examples for the browser and node.js can be found [here](https://github.com/streamr-dev/streamr-client/tree/master/examples).

Please see the [API Docs](https://streamr-dev.github.io/streamr-client-javascript/) for more detailed documentation.

If you don't have an Ethereum account you can use the utility function `StreamrClient.generateEthereumAccount()`, which returns the address and private key of a fresh Ethereum account.

### Creating a StreamrClient instance

```js
const client = new StreamrClient({
    auth: {
        privateKey: 'your-private-key'
    }
})
```

When using Node.js remember to import the library with:

```js
import { StreamrClient } from 'streamr-client';
```

### Subscribing to real-time events in a stream

```js
const sub = await client.subscribe({
    stream: 'streamId',
    partition: 0, // Optional, defaults to zero. Use for partitioned streams to select partition.
    // optional resend options here
}, (message, metadata) => {
    // This is the message handler which gets called for every incoming message in the stream.
    // Do something with the message here!
})
```

### Resending historical data

```js
const sub = await client.resend({
    stream: 'streamId',
    resend: {
        last: 5,
    },
}, (message) => {
    // This is the message handler which gets called for every received message in the stream.
    // Do something with the message here!
})
```

See "Subscription options" for resend options

### Programmatically creating a stream

```js
const stream = await client.getOrCreateStream({
    name: 'My awesome stream created via the API',
})
console.log(`Stream ${stream.id} has been created!`)
// Do something with the stream, for example call stream.publish(message)
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
await client.publish('my-stream-id', msg)

// The first argument can also be the stream object
await client.publish(stream, msg)

// Publish with a specific timestamp as a Date object (default is now)
await client.publish('my-stream-id', msg, new Date(54365472))

// Publish with a specific timestamp in ms
await client.publish('my-stream-id', msg, 54365472)

// Publish with a specific timestamp as a ISO8601 string
await client.publish('my-stream-id', msg, '2019-01-01T00:00:00.123Z')

// Publish with a specific partition key (read more about partitioning further down this readme)
await client.publish('my-stream-id', msg, Date.now(), 'my-partition-key')

// For convenience, stream.publish(...) equals client.publish(stream, ...)
await stream.publish(msg)
```

----

## API Docs

The [API docs](https://streamr-dev.github.io/streamr-client-javascript/) are automatically generated from the TypeScript source code. They can also be rebuilt locally via:

```
npm run docs
```

## Client options

| Option                   | Default value                    | Description                                                                                                                                                                                                                                                                                                                             |
| :----------------------- | :------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| url                      | wss://streamr.network/api/v1/ws  | Address of the Streamr websocket endpoint to connect to.                                                                                                                                                                                                                                                                                |
| restUrl                  | <https://streamr.network/api/v1> | Base URL of the Streamr REST API.                                                                                                                                                                                                                                                                                                       |
| auth                     | {}                               | Object that can contain different information to authenticate. More details below.                                                                                                                                                                                                                                                      |
| publishWithSignature     | 'auto'                           | Determines if data points published to streams are signed or not. Possible values are: 'auto', 'always' and 'never'. Signing requires `auth.privateKey` or `auth.ethereum`.  'auto' will sign only if one of them is set. 'always' will throw an exception if none of them is set.                                                      |
| verifySignatures         | 'auto'                           | Determines under which conditions signed and unsigned data points are accepted or rejected. 'always' accepts only signed and verified data points. 'never' accepts all data points. 'auto' verifies all signed data points before accepting them and accepts unsigned data points only for streams not supposed to contain signed data. |
| autoConnect              | true                             | If set to `true`, the client connects automatically on the first call to `subscribe()`. Otherwise an explicit call to `connect()` is required.                                                                                                                                                                                          |
| autoDisconnect           | true                             | If set to `true`, the client automatically disconnects when the last stream is unsubscribed. Otherwise the connection is left open and can be disconnected explicitly by calling `disconnect()`.                                                                                                                                        |
| orderMessages            | true                             | If set to `true`, the subscriber handles messages in the correct order, requests missing messages and drops duplicates. Otherwise, the subscriber processes messages as they arrive without any check.                                                                                                                                  |
| maxPublishQueueSize      | 10000                            | Only in effect when `autoConnect = true`. Controls the maximum number of messages to retain in internal queue when client has disconnected and is reconnecting to Streamr.                                                                                                                                                              |
| publisherGroupKeys       | {}                               | Object defining the group key as a hex string used to encrypt for each stream id.                                                                                                                                                                                                                                                       |
| publisherStoreKeyHistory | true                             | If `true`, the client will locally store every key used to encrypt messages at some point. If set to `false`, the client will not be able to answer subscribers asking for historical keys during resend requests.                                                                                                                      |
| subscriberGroupKeys      | {}                               | Object defining, for each stream id, an object containing the group key used to decrypt for each publisher id. Not needed if `keyExchange` is defined.                                                                                                                                                                                  |
| keyExchange              | {}                               | Defines RSA key pair to use for group key exchange. Can define `publicKey` and `privateKey` fields as strings in the PEM format, or stay empty to generate a key pair automatically. Can be set to `null` if no key exchange is required.                                                                                               |

## Authentication options

Note: **Authenticating with an API key has been deprecated. Cryptographic keys/wallets is the only supported authentication method.**

If you don't have an Ethereum account you can use the utility function `StreamrClient.generateEthereumAccount()`, which returns the address and private key of a fresh Ethereum account.

Authenticating with Ethereum also automatically creates an associated Streamr user, even if it doesn't already exist. Under the hood, the client will cryptographically sign a challenge to authenticate you as a Streamr user:

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

(Authenticating with a pre-existing session token, for internal use by the Streamr app):

```js
const client = new StreamrClient({
    auth: {
        sessionToken: 'session-token'
    }
})
```

## Connecting

By default the client will automatically connect and disconnect as needed, ideally you should not need to manage connection state explicitly.
Specifically, it will automatically connect when you publish or subscribe, and automatically disconnect once all subscriptions are removed and no
messages were recently published. This behaviour can be disabled using the `autoConnect` & `autoDisconnect` options when creating a `new
StreamrClient`. Explicit calls to either `connect()` or `disconnect()` will disable all `autoConnect` & `autoDisconnect` functionality, but they can
be re-enabled by calling `enableAutoConnect()` or `enableAutoDisconnect()`.

Calls that need a connection, such as `publish` or `subscribe` will fail with an error if you are disconnected and autoConnect is disabled.

| Name                                | Description                                                                                                                                                                                         |
| :---------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| connect()                           | Safely connects if not connected. Returns a promise. Resolves immediately if already connected. Only rejects if an error occurs during connection.                                                  |
| disconnect()                        | Safely disconnects if not already disconnected, clearing all subscriptions. Returns a Promise.  Resolves immediately if already disconnected. Only rejects if an error occurs during disconnection. |
| enableAutoConnect(enable = true)    | Enables autoConnect if it wasn't already enabled. Does not connect immediately. Use `enableAutoConnect(false)` to disable autoConnect.                                                              |
| enableAutoDisconnect(enable = true) | Enables autoDisconnect if it wasn't already enabled. Does not disconnect immediately. Use `enableAutoConnect(false)` to disable autoDisconnect.                                                     |

```js
const client = new StreamrClient({
    auth: {
        privateKey: 'your-private-key'
    },
    autoConnect: false,
    autoDisconnect: false,
})

await client.connect()
```

## Managing subscriptions

| Name                         | Description                                                                                                                                                                     |
| :--------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| subscribe(options, callback) | Subscribes to a stream. Messages in this stream are passed to the `callback` function. See below for subscription options. Returns a Promise resolving a `Subscription` object. |
| unsubscribe(Subscription)    | Unsubscribes the given `Subscription`. Returns a promise.                                                                                                                       |
| unsubscribeAll(`streamId`)   | Unsubscribes all `Subscriptions` for `streamId`. Returns a promise.                                                                                                             |
| getSubscriptions(`streamId`) | Returns a list of `Subscriptions` for `streamId`. Returns a promise.                                                                                                            |

### Message handler callback

The second argument to `client.subscribe(options, callback)` is the callback function that will be called for each message as they arrive. Its arguments are as follows:

| Argument      | Description                                                                                                                                                                                                                      |
| :------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| payload       | A JS object containing the message payload itself                                                                                                                                                                                |
| streamMessage | The whole [StreamMessage](https://github.com/streamr-dev/streamr-client-protocol-js/blob/master/src/protocol/message_layer/StreamMessage.js) object containing various metadata, for example `streamMessage.getTimestamp()` etc. |

```js
const sub = await client.subscribe({
    streamId: 'my-stream-id',
}, (payload, streamMessage) => {
    console.log({
        payload, streamMessage
    })
})

```

### Subscription Options

Note that only one of the resend options can be used for a particular subscription. The default functionality is to resend nothing, only subscribe to messages from the subscription moment onwards.

| Name      | Description                                                                        |
| :-------- | :--------------------------------------------------------------------------------- |
| stream    | Stream id to subscribe to                                                          |
| partition | Partition number to subscribe to. Defaults to partition 0.                         |
| resend    | Object defining the resend options. Below are examples of its contents.            |
| groupKeys | Object defining the group key as a hex string for each publisher id of the stream. |

```js
// Resend N most recent messages
const sub1 = await client.subscribe({
    streamId: 'my-stream-id',
    resend: {
        last: 10,
    }
}, onMessage)

// Resend from a specific message reference up to the newest message
const sub2 = await client.subscribe({
    streamId: 'my-stream-id',
    resend: {
        from: {
            timestamp: 12345,
            sequenceNumber: 0, // optional
        },
        publisher: 'publisherId', // optional
        msgChainId: 'msgChainId', // optional
    }
}, onMessage)

// Resend a limited range of messages
const sub3 = await client.subscribe({
    streamId: 'my-stream-id',
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
}, onMessage)
```

If you choose one of the above resend options when subscribing, you can listen on the completion of this resend by doing the following:

```js
const sub = await client.subscribe(options)
sub.on('resent', () => {
    console.log('All caught up and received all requested historical messages! Now switching to real time!')
})
```

## Stream API

All the below functions return a Promise which gets resolved with the result.

| Name                                                | Description                                                                                                                                          |
| :-------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- |
| getStream(streamId)                                 | Fetches a stream object from the API.                                                                                                                |
| listStreams(query)                                  | Fetches an array of stream objects from the API. For the query params, consult the [API docs](https://api-explorer.streamr.com).                     |
| getStreamByName(name)                               | Fetches a stream which exactly matches the given name.                                                                                               |
| createStream(\[properties])                         | Creates a stream with the given properties. For more information on the stream properties, consult the [API docs](https://api-explorer.streamr.com). |
| getOrCreateStream(properties)                       | Gets a stream with the id or name given in `properties`, or creates it if one is not found.                                                          |
| publish(streamId, message, timestamp, partitionKey) | Publishes a new message to the given stream.                                                                                                         |

### Stream object

All the below functions return a Promise which gets resolved with the result.

| Name                                      | Description                                                                                                                                                                                                                                                                   |
| :---------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| update()                                  | Updates the properties of this stream object by sending them to the API.                                                                                                                                                                                                      |
| delete()                                  | Deletes this stream.                                                                                                                                                                                                                                                          |
| getPermissions()                          | Returns the list of permissions for this stream.                                                                                                                                                                                                                              |
| hasPermission(operation, user)            | Returns a permission object, or null if no such permission was found. Valid `operation` values for streams are: stream_get, stream_edit, stream_delete, stream_publish, stream_subscribe, and stream_share. `user` is the username of a user, or null for public permissions. |
| grantPermission(operation, user)          | Grants the permission to do `operation` to `user`, which are defined as above.                                                                                                                                                                                                |
| revokePermission(permissionId)            | Revokes a permission identified by its `id`.                                                                                                                                                                                                                                  |
| detectFields()                            | Updates the stream field config (schema) to match the latest data point in the stream.                                                                                                                                                                                        |
| publish(message, timestamp, partitionKey) | Publishes a new message to this stream.                                                                                                                                                                                                                                       |

## Data Unions

This library provides functions for working with Data Unions. Please see the [API Docs](https://streamr-dev.github.io/streamr-client-javascript/) for auto-generated documentation on each Data Union endpoint.

To deploy a new DataUnion with default [deployment options](#deployment-options):
```js
const dataUnion = await client.deployDataUnion()
```

To get an existing (previously deployed) `DataUnion` instance:
```js
const dataUnion = client.getDataUnion(dataUnionAddress)
```

<!-- This stuff REALLY isn't for those who use our infrastructure, neither DU admins nor DU client devs. It's only relevant if you're setting up your own sidechain.
These DataUnion-specific options can be given to `new StreamrClient` options:

| Property                            | Default                                                | Description                                                                                                      |
| :---------------------------------- | :----------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------- |
| dataUnion.minimumWithdrawTokenWei   | 1000000                                                | Threshold value set in AMB configs, smallest token amount that can pass over the bridge                          |
| dataUnion.freeWithdraw              | false                                                  | true = someone else pays for the gas when transporting the withdraw tx to mainnet |
|                                     |                                                        | false = client does the transport as self-service and pays the mainnet gas costs |
-->

### Admin Functions

| Name                              | Returns             | Description                                                    |
| :-------------------------------- | :------------------ | :------------------------------------------------------------- |
| createSecret(\[name])             | string              | Create a secret for a Data Union                               |
| setAdminFee(newFeeFraction)       | Transaction receipt | `newFeeFraction` is a `Number` between 0.0 and 1.0 (inclusive) |
| addMembers(memberAddressList)     | Transaction receipt | Add members                                                    |
| removeMembers(memberAddressList)  | Transaction receipt | Remove members from Data Union                                 |
| withdrawAllToMember(memberAddress\[, [options](#withdraw-options)\])                              | Transaction receipt `*` | Send all withdrawable earnings to the member's address |
| withdrawAllToSigned(memberAddress, recipientAddress, signature\[, [options](#withdraw-options)\]) | Transaction receipt `*` | Send all withdrawable earnings to the address signed off by the member (see [example below](#member-functions)) |
`*` The return value type may vary depending on [the given options](#withdraw-options) that describe the use case. 

Here's how to deploy a Data Union contract with 30% Admin fee and add some members:

```js
import { StreamrClient } from 'streamr-client'

const client = new StreamrClient({
    auth: { privateKey },
})

const dataUnion = await client.deployDataUnion({
    adminFee: 0.3,
})
const receipt = await dataUnion.addMembers([
    "0x1234567890123456789012345678901234567890",
    "0x1234567890123456789012345678901234567891",
    "0x1234567890123456789012345678901234567892",
])
```

### Member functions

| Name                                                                  | Returns                   | Description                                                                 |
| :-------------------------------------------------------------------- | :------------------------ | :-------------------------------------------------------------------------- |
| join(\[secret])                                                       | JoinRequest               | Join the Data Union (if a valid secret is given, the promise waits until the automatic join request has been processed)  |
| isMember(memberAddress)                                               | boolean                   |                                                                             |
| withdrawAll(\[[options](#withdraw-options)\])                         | Transaction receipt `*`   | Withdraw funds from Data Union                                              |
| withdrawAllTo(recipientAddress\[, [options](#withdraw-options)\])     | Transaction receipt `*`   | Donate/move your earnings to recipientAddress instead of your memberAddress |
| signWithdrawAllTo(recipientAddress)                                   | Signature (string)        | Signature that can be used to withdraw all available tokens to given recipientAddress        |
| signWithdrawAmountTo(recipientAddress, amountTokenWei)                | Signature (string)        | Signature that can be used to withdraw a specific amount of tokens to given recipientAddress |
| transportMessage(messageHash[, pollingIntervalMs[, retryTimeoutMs]])  | Transaction receipt       | Send the mainnet transaction to withdraw tokens from the sidechain | 
`*` The return value type may vary depending on [the given options](#withdraw-options) that describe the use case.

Here's an example on how to sign off on a withdraw to (any) recipientAddress (NOTE: this requires no gas!)

```js
import { StreamrClient } from 'streamr-client'

const client = new StreamrClient({
    auth: { privateKey },
})

const dataUnion = client.getDataUnion(dataUnionAddress)
const signature = await dataUnion.signWithdrawAllTo(recipientAddress)
```

Later, anyone (e.g. Data Union admin) can send that withdraw transaction to the blockchain (and pay for the gas)

```js
import { StreamrClient } from 'streamr-client'

const client = new StreamrClient({
    auth: { privateKey },
})

const dataUnion = client.getDataUnion(dataUnionAddress)
const receipt = await dataUnion.withdrawAllToSigned(memberAddress, recipientAddress, signature)
```

The `messageHash` argument to `transportMessage` will come from the withdraw function with the specific options. The following is equivalent to the above withdraw line:
```js
const messageHash = await dataUnion.withdrawAllToSigned(memberAddress, recipientAddress, signature, {
    transportSignatures: false,
    waitUntilTransportIsComplete: false,
}) // only pay for sidechain gas
const receipt = await dataUnion.transportMessage(messageHash) // only pay for mainnet gas
```

### Query functions

These are available for everyone and anyone, to query publicly available info from a Data Union:

| Name                                                       | Returns                                        | Description                             |
| :--------------------------------------------------------- | :--------------------------------------------- | :-------------------------------------- |
| getStats()                                                 | {activeMemberCount, totalEarnings, ...}        | Get Data Union's statistics             |
| getMemberStats(memberAddress)                              | {earnings, proof, ...}                         | Get member's stats                      |
| getWithdrawableEarnings(memberAddress)                     | `BigNumber` withdrawable DATA tokens in the DU |                                         |
| getAdminFee()                                              | `Number` between 0.0 and 1.0 (inclusive)       | Admin's cut from revenues               |
| getAdminAddress()                                          | Ethereum address                               | Data union admin's address              |
| getVersion()                                               | `0`, `1` or `2`                                | `0` if the contract is not a data union |

Here's an example how to get a member's withdrawable token balance (in "wei", where 1 DATA = 10^18 wei)

```js
import { StreamrClient } from 'streamr-client'

const dataUnion = new StreamrClient().getDataUnion(dataUnionAddress)
const withdrawableWei = await dataUnion.getWithdrawableEarnings(memberAddress)
```

### Withdraw options

The functions `withdrawAll`, `withdrawAllTo`, `withdrawAllToMember`, `withdrawAllToSigned` all can take an extra "options" argument. It's an object that can contain the following parameters:

| Name              | Default               | Description                                                                           |
| :---------------- | :-------------------- | :----------------------------------------------------------------------------------   |
| sendToMainnet     | true                  | Whether to send the withdrawn DATA tokens to mainnet address (or sidechain address)   |
| transportSignatures | true                | Whether to pay for the withdraw transaction signature transport to mainnet over the bridge |
| waitUntilTransportIsComplete | true       | Whether to wait until the withdrawn DATA tokens are visible in mainnet                |
| pollingIntervalMs | 1000 (1&nbsp;second)  | How often requests are sent to find out if the withdraw has completed                 |
| retryTimeoutMs    | 60000 (1&nbsp;minute) | When to give up when waiting for the withdraw to complete                             |

These withdraw transactions are sent to the sidechain, so gas price shouldn't be manually set (fees will hopefully stay very low),
but a little bit of [sidechain native token](https://www.xdaichain.com/for-users/get-xdai-tokens) is nonetheless required.

The return values from the withdraw functions also depend on the options.

If `sendToMainnet: false`, other options don't apply at all, and **sidechain transaction receipt** is returned as soon as the withdraw transaction is done. This should be fairly quick in the sidechain.

The use cases corresponding to the different combinations of the boolean flags:

| `transport` | `wait`  | Returns | Effect |
| :---------- | :------ | :------ | :----- |
| `true`      | `true`  | Transaction receipt | *(default)* Self-service bridge to mainnet, client pays for mainnet gas |
| `true`      | `false` | Transaction receipt | Self-service bridge to mainnet (but **skip** the wait that double-checks the withdraw succeeded and tokens arrived to destination) |
| `false`     | `true`  | `null`              | Someone else pays for the mainnet gas automatically, e.g. the bridge operator (in this case the transaction receipt can't be returned) |
| `false`     | `false` | AMB message hash    | Someone else pays for the mainnet gas, but we need to give them the message hash first | 

### Deployment options

`deployDataUnion` can take an options object as the argument. It's an object that can contain the following parameters:

| Name                      | Type      | Default               | Description                                                                           |
| :------------------------ | :-------- | :-------------------- | :------------------------------------------------------------------------------------ |
| owner                     | Address   |`*`you                 | Owner / admin of the newly created Data Union                                         |
| joinPartAgents            | Address[] |`*`you, Streamr Core   | Able to add and remove members to/from the Data Union                                 |
| dataUnionName             | string    | Generated             | NOT stored anywhere, only used for address derivation                                 |
| adminFee                  | number    | 0 (no fee)            | Must be between 0...1 (inclusive)                                                     |
| sidechainPollingIntervalMs| number    | 1000 (1&nbsp;second)  | How often requests are sent to find out if the deployment has completed               |
| sidechainRetryTimeoutMs   | number    | 60000 (1&nbsp;minute) | When to give up when waiting for the deployment to complete                           |
| confirmations             | number    | 1                     | Blocks to wait after Data Union mainnet contract deployment to consider it final      |
| gasPrice                  | BigNumber | network estimate      | Ethereum Mainnet gas price to use when deploying the Data Union mainnet contract      |

`*`you here means the address of the authenticated StreamrClient
(that corresponds to the `auth.privateKey` given in constructor)

Streamr Core is added as a `joinPartAgent` by default
so that joining with secret works using the [member function](#member-functions) `join`.
If you don't plan to use `join` for "self-service joining",
you can leave out Streamr Core agent by calling `deployDataUnion`
e.g. with your own address as the sole joinPartAgent:
```
const dataUnion = await client.deployDataUnion({
    joinPartAgents: [yourAddress],
    adminFee,
})
```

`dataUnionName` option exists purely for the purpose of predicting the addresses of Data Unions not yet deployed.
Data Union deployment uses the [CREATE2 opcode](https://eips.ethereum.org/EIPS/eip-1014) which means
a Data Union deployed by a particular address with particular "name" will have a predictable address.
            
## Utility functions

| Name                                    | Returns                 |   Description    |
| :-------------------------------------- | :---------------------- | :--------------- |
| `*` generateEthereumAccount()           | `{address, privatekey}` | Generates a random Ethereum account  |
| getTokenBalance(address)                | `BigNumber`             | Mainnet DATA token balance |
| getSidechainTokenBalance(address)       | `BigNumber`             | Sidechain DATA token balance |

`*` The static function `StreamrClient.generateEthereumAccount()` generates a new
Ethereum private key and returns an object with fields `address` and `privateKey`.
Note that this private key can be used to authenticate to the Streamr API
by passing it in the authentication options, as described earlier in this document.

## Events

The client and the subscriptions can fire events as detailed below.
You can bind to them using `on`.

| Name                                | Description                                                                              |
| :---------------------------------- | :--------------------------------------------------------------------------------------- |
| on(eventName, function)             | Binds a `function` to an event called `eventName`                                        |
| once(eventName, function)           | Binds a `function` to an event called `eventName`. It gets called once and then removed. |
| removeListener(eventName, function) | Unbinds the `function` from events called `eventName`                                    |

### Events on the StreamrClient instance

| Name         | Handler Arguments | Description                                                      |
| :----------- | :---------------- | :--------------------------------------------------------------- |
| connected    |                   | Fired when the client has connected (or reconnected).            |
| disconnected |                   | Fired when the client has disconnected (or paused).              |
| error        | Error             | Fired when the client encounters an error e.g. connection issues |

```js
// The StreamrClient emits various events
client.on('connected', () => {
    // note no need to wait for this before doing work,
    // with autoconnect enabled the client will happily establish a connection for you as required.
    console.log('Yeah, we are connected now!')
})
```

### Events on the Subscription object

| Name         | Handler Arguments                                                                                                                                                         | Description                                                                                         |
| :----------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------- |
| unsubscribed |                                                                                                                                                                           | Fired when an unsubscription is acknowledged by the server.                                         |
| resent       | [ResendResponseResent](https://github.com/streamr-dev/streamr-client-protocol-js/blob/master/src/protocol/control_layer/resend_response_resent/ResendResponseResentV1.js) | Fired after `resending` when the subscription has finished resending and message has been processed |
| error        | Error object                                                                                                                                                              | Reports errors, for example problems with message content                                           |

## Stream Partitioning

Partitioning (sharding) enables streams to scale horizontally. This section describes how to use partitioned streams via this library. To learn the basics of partitioning, see [the docs](https://streamr.network/docs/streams#partitioning).

### Creating partitioned streams

By default, streams only have 1 partition when they are created. The partition count can be set to any positive number (1-100 is reasonable). An example of creating a partitioned stream using the JS client:

```js
const stream = await client.createStream({
    name: 'My partitioned stream',
    partitions: 10,
})
console.log(`Stream created: ${stream.id}. It has ${stream.partitions} partitions.`)
```

### Publishing to partitioned streams

In most use cases, a user wants related events (e.g. events from a particular device) to be assigned to the same partition, so that the events retain a deterministic order and reach the same subscriber(s) to allow them to compute stateful aggregates correctly.

The library allows the user to choose a _partition key_, which simplifies publishing to partitioned streams by not requiring the user to assign a partition number explicitly. The same partition key always maps to the same partition. In an IoT use case, the device id can be used as partition key; in user interaction data it could be the user id, and so on.

The partition key can be given as an argument to the `publish` methods, and the library assigns a deterministic partition number automatically:

```js
await client.publish('my-stream-id', msg, Date.now(), msg.vehicleId)

// or, equivalently
await stream.publish(msg, Date.now(), msg.vehicleId)
```

### Subscribing to partitioned streams

By default, the JS client subscribes to the first partition (partition `0`) in a stream. The partition number can be explicitly given in the subscribe call:

```js
const sub = await client.subscribe({
    stream: 'my-stream-id',
    partition: 4, // defaults to 0
}, (payload) => {
    console.log('Got message %o', payload)
})
```

Or, to subscribe to multiple partitions, if the subscriber can handle the volume:

```js
const handler = (payload, streamMessage) => {
    console.log('Got message %o from partition %d', payload, streamMessage.getStreamPartition())
}

await Promise.all([2, 3, 4].map(async (partition) => {
    await client.subscribe({
        stream: 'my-stream-id',
        partition,
    }, handler)
}))
```

## Logging

The Streamr JS client library supports [debug](https://github.com/visionmedia/debug) for logging.

In node.js, start your app like this: `DEBUG=StreamrClient* node your-app.js`

In the browser, set `localStorage.debug = 'StreamrClient*'`

## For Developers

Publishing to npm is automated via Github Actions. Follow the steps below to publish `latest` or `beta`.

For more technical documentation on the Data Unions API, see the [JS Client API Docs](https://streamr-dev.github.io/streamr-client-javascript/). These can also be rebuilt locally via:
```
npm run docs
```

### Publishing `latest`

1.  Update version with either `npm version [patch|minor|major]`. Use
    semantic versioning <https://semver.org/>. Files package.json and
    package-lock.json will be automatically updated, and an appropriate
    git commit and tag created.

2.  `git push --follow-tags`

3.  Wait for Github Actions to run tests

4.  If tests passed, Github Actions will publish the new version to npm

### Publishing `beta`

1.  Update version with either `npm version [prepatch|preminor|premajor] --preid=beta`. Use semantic versioning
    <https://semver.org/>. Files package.json and package-lock.json will be automatically updated, and an appropriate git commit and tag created.

2.  `git push --follow-tags`

3.  Wait for Github Actions to run tests

4.  If tests passed, Github Actions will publish the new version to npm
