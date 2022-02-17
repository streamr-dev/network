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

The current stable version of the Streamr Client is `5.x` (at the time of writing, February 2022) which is connected to the [Corea Network](https://streamr.network/roadmap). The Brubeck Network Streamr Client is the [6.0.0-beta.2](https://www.npmjs.com/package/streamr-client/v/6.0.0-beta.2) build along with the `testnet` builds of the Broker node. The developer experience of the two networks is the same, however, the `6.0.0-beta.2` client also runs as a light node in the network, whereas the `5.x` era client communicates remotely to a Streamr run node. When the Streamr Network transitions into the Brubeck era (ETA Jan/Feb 2022), data guarantees of `5.x` clients will need to be reassessed. Publishing data to the Brubeck network will only be visible in the [Brubeck Core UI](https://brubeck.streamr.network). The Marketplace, Core app and CLI tool are currently all configured to interact with the Corea Network only. Take care not to mix networks during this transition period.

---

## Table of contents

[Installation](#installation) · [Usage](#usage) · [API Docs](#API-docs) · [Client options](#client-options) · [Authentication](#authentication-options) · [Managing subscriptions](#managing-subscriptions) · [Stream API](#stream-api) · [Subscription options](#subscription-options) · [Storage](#storage) ·[Data Unions](#data-unions) · [Utility functions](#utility-functions) · [Events](#events) · [Stream Partitioning](#stream-partitioning) · [Logging](#logging) · [NPM Publishing](#publishing-latest)

## Get Started
Here are some usage examples. More examples can be found [here](https://github.com/streamr-dev/examples).

> To use with react please see [streamr-client-react](https://github.com/streamr-dev/streamr-client-react)

> In Streamr, Ethereum accounts are used for identity. You can generate an Ethereum private key using any Ethereum wallet, or you can use the utility function `StreamrClient.generateEthereumAccount()`, which returns the address and private key of a fresh Ethereum account.



### Subscribing to a stream
```js 

client.subscribe(STREAM_ID, (message) => {
    // handle for individual messages
})

```
### Creating & publishing to a stream
```js 
const stream = await client.createStream({
    id: '/foo/bar'
})

await stream.publish({foo: 'bar'})
```


### Installation
The client is available on [npm](https://www.npmjs.com/package/streamr-client) and can be installed simply by:

```
npm install streamr-client
```

### Importing `streamr-client`
When using Node.js remember to import the library with:

```js
import { StreamrClient } from 'streamr-client'
```

Or 
```js
const { StreamrClient } = require('streamr-client')
```
For usage in the browser include the latest build, e.g. by including a `<script>` tag pointing at a CDN:

```html
<!-- for Brubeck package (6x) -->
<script src="https://unpkg.com/streamr-client@6.0.0-beta.2/streamr-client.web.js"></script>
```

### Creating a StreamrClient instance
```js
const client = new StreamrClient({
    auth: {
        privateKey: 'your-ethereum-private-key'
    }
})
```
> ℹ️ More `StreamrClient` creation options can be found in the [Installation](#installation) section.

### Getting the client's address
```js
const address = await client.getAddress()
```

### Creating a stream 
```js
const stream = await client.createStream({
    id: '/foo/bar'
})

// stream.id = `${address}/foo/bar`
```

In order to  enable historical data `resends` add first the stream to a storage node:
```js
import { STREAMR_STORAGE_NODE_GERMANY, StreamrClient } from StreamrClient

await stream.addToStorageNode(STREAMR_STORAGE_NODE_GERMANY)
```
> ℹ️ Visit the [Storage section](#storage) for more options.

### Fetching existent streams
Getting an existent stream is pretty straight-forward
```js
const stream = await client.getStream(STREAM_ID)
```

The method `getOrCreateStream` allows for a seamless creation/fetching process:
```js
const stream = await client.getOrCreateStream({
    id: `${address}/doc-tests`
})
```

### Subscribing to real-time events in a stream

```js
const sub = await client.subscribe({
    id: STREAM_ID,
    partition: 0, // Optional, defaults to zero. Use for partitioned streams to select partition.
    // optional resend options here
}, (message, metadata) => {
    // This is the message handler which gets called for every incoming message in the stream.
    // Do something with the message here!
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

See "Subscription options" for resend options

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

----

## Client configuration
### Authentication
If you don't have an Ethereum account you can use the utility function [StreamrClient.generateEthereumAccount()](#utility-functions), which returns the address and private key of a fresh Ethereum account.

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

Authenticating with Metamask's Ethereum private key contained in an Ethereum (web3) provider:
```js
import detectEthereumProvider from '@metamask/detect-provider'

const client = new StreamrClient({
    auth: {
        ethereum: detectEthereumProvider()
    }
})
```


### Message ordering
[REQUIRES EXPLANATION AND DEVELOPMENT]
```js
const client = new StreamrClient({
    auth: { ... },
    orderMessages: false, // defaults to true
})
```
### Gap Filling
[REQUIRES EXPLANATION AND DEVELOPMENT]
```js
const client = new StreamrClient({
    auth: { ... },
    gapFill: boolean
    maxGapRequests: number
    maxRetries: number
    gapFillTimeout: number
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

## Stream subscriptions
```js
const STREAM_ID = {
    id: `${address}/foo/bar`,
    partition: 0
}
// subscribing to a stream:
const subscription = await client.subscribe(STREAM_ID, (message) => { ... })

// fetching all streams the client is subscribed to:
const subscriptions = client.getSubscriptions()

// unsubscribing from an existent subscription:
await client.unsubscribe(STREAM_ID)

// or, unsubscribe them all:
const streams = await client.unsubscribe()
```

### Message handler callback

The second argument to `client.subscribe(options, callback)` is the callback function that will be called for each message as they arrive. Its arguments are as follows:

| Argument      | Description                                                                                                                                                                                                                      |
| :------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| payload       | A JS object containing the message payload itself                                                                                                                                                                                |
| streamMessage | The whole [StreamMessage](https://github.com/streamr-dev/streamr-client-protocol-js/blob/master/src/protocol/message_layer/StreamMessage.js) object containing various metadata, for example `streamMessage.getTimestamp()` etc. |

```js
const sub = await client.subscribe({
    streamId: STREAM_ID,
}, (payload: any, streamMessage: StreamMessage) => {
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
const sub1 = await client.subscribeResend({
    streamId: STREAM_ID,
    resend: {
        last: 10,
    }
}, onMessage)

// Resend from a specific message reference up to the newest message
const sub2 = await client.subscribeResend({
    streamId: STREAM_ID,
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
const sub3 = await client.subscribeResend({
    streamId: STREAM_ID,
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
> ⚠️ Seems like the `subscribe` method no longer returns and eventEmitter and the `.on('resend', ...)` expected behavior is not available

If you choose one of the above resend options when subscribing, you can listen on the completion of this resend by doing the following:

```js
// THIS CODE DOES NOT CURRENTLY WORK! 
// COULD NOT FIND A REPLACEMENT
const sub = await client.subscribe(options)
sub.on('resent', () => {
    console.log('All caught up and received all requested historical messages! Now switching to real time!')
})
```

## Storage

You can enable data storage on your streams to retain historical data in one or more geographic locations of your choice and access it later via `resend`. By default storage is not enabled on streams. You can enable it with:

```js
import { StorageNode } from 'streamr-client'
...
// assign a stream to storage
await stream.addToStorageNode(StorageNode.STREAMR_GERMANY)
// fetch the storage nodes for a stream
const storageNodes = stream.getStorageNodes()
// remove the stream from a storage node
await stream.removeFromStorageNode(StorageNode.STREAMR_GERMANY)
```



## Stream API

All the below functions return a Promise which gets resolved with the result.

| Name                                                | Description                                                                                                                                          |
| :-------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- |
| getStream(streamId)                                 | Fetches a stream object from the API.                                                                                                                |
| listStreams(query)                                  | Fetches an array of stream objects from the API. For the query params, consult the [API docs](https://api-explorer.streamr.com).                     |
| getStreamByName(name)                               | Fetches a stream which exactly matches the given name.                                                                                               |
| createStream(\[properties])                         | Creates a stream with the given properties. For more information on the stream properties, consult the [API docs](https://api-explorer.streamr.com). You must specify the `id`. It must start with your ethereum address.|
| getOrCreateStream(properties)                       | Gets a stream with the id or name given in `properties`, or creates it if one is not found.                                                          |
| publish(streamId, message, timestamp, partitionKey) | Publishes a new message to the given stream.                                                                                                         |

```js
// getStream
const stream: Stream = await client.getStream(STREAM_ID)

// getStreamByName
const stream = await client.getStreamByName('stream-name')

// listStreams
const streams: Stream[] = await client.listStreams({
    name?: string;
    uiChannel?: boolean;
    noConfig?: boolean;
    search?: string;
    sortBy?: string;
    order?: 'asc' | 'desc';
    max?: number;
    offset?: number;
    grantedAccess?: boolean;
    publicAccess?: boolean;
    operation?: StreamOperation;
})

// createStream
const stream = await client.createStream({
    id: `${await client.getAddress()}/stream-01`
})
// getOrCreateStream
const stream = await client.getOrCreateStream({
    id: `${await client.getAddress()}/stream-01`
})

```

### Stream object

All the below functions return a Promise which gets resolved with the result.




| Name                                      | Description                                                                                                                                                                                                                                                                   |
| :---------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| update()                                  | Updates the properties of this stream object by sending them to the API.                                                                                                                                                                                                      |
| delete()                                  | Deletes this stream.                                                                                                                                                                                                                                                          |
| getPermissions()                          | Returns the list of permissions for this stream.                                                                                                                                                                                                                              |
| revokeUserPermission(operation, user)            | Revokes the permission for `operation` previously granted to `user`        |       
| revokeAllPublicPermissions() | Revokes all permissions to `user` for that stream |
| detectFields()                            | Updates the stream field config (schema) to match the latest data point in the stream.                                                                                                                                                                                        |
| publish(message, timestamp, partitionKey) | Publishes a new message to this stream.                                                                                                                                                                                                                                       |
| hasUserPermission(operation, user) | Returns the StreamPermission for `user` on `operation`, if found, or `undefined` |
| hasPublicPermission(operation) | Checks if the public permission for `operation` exists on the stream |
| grantUserPermission | Alias of `grantPermission`
| grantPublicPermission(operation) | Grants public permission to the `operation`
| revokePublicPermission(operation) | Removes the public permission on the `operation`
| revokeAllUserPermissions(user) | Removes all permissions for `user`
| revokeAllPublicPermissions() | Removes all public permissions
| setPermissionsForUser (user, canEdit, canDelete, canPublish, canSubscribe, canShare) | Defines the permissions for `user` by providing booleans for `canEdit`, `canPublish`, `canSubscribe` and `canShare` |
| setPermissions(users[], permissions[]) | Grants each set of `StreamPermission` to their corresponding `users` element

### Stream Operations and Permissions 
The matrix below outlines the role types and permissions for streams.

|Permissions | User can | Subscriber | Publisher | Editor | Owner |
|:--|:--|:--|:--|:--|:--|
| canEdit | Edit stream details| | |✔️|✔️|
| canDelete | Delete the stream| | | |✔️|
| canPublish | Publish to stream| |✔️|✔️|✔️|
| canSubscribe | Subscribe to stream|✔️| |✔️|✔️|
| canGrant | Edit stream permissions| | | |✔️|

## Data Unions

This library provides functions for working with Data Unions. Please see the [TypeScript generated function documentation](https://streamr-dev.github.io/streamr-client-javascript/classes/dataunion_dataunion.dataunion.html) for information on each Data Union endpoint.

To deploy a new DataUnion with default [deployment options](#deployment-options):
```js
const dataUnion = await client.deployDataUnion()
```

To get an existing (previously deployed) `DataUnion` instance:
```js
const dataUnion = await client.getDataUnion(dataUnionAddress)
```

<!-- This stuff REALLY isn't for those who use our infrastructure, neither DU admins nor DU client devs. It's only relevant if you're setting up your own sidechain.
These DataUnion-specific options can be given to `new StreamrClient` options:

| Property                            | Default                                                | Description                                                                                |
| :---------------------------------- | :----------------------------------------------------- | :----------------------------------------------------------------------------------------- |
| dataUnion.minimumWithdrawTokenWei   | 1000000                                                | Threshold value set in AMB configs, smallest token amount that can pass over the bridge    |
| dataUnion.payForTransport           | true                                                   | true = client does the transport as self-service and pays the mainnet gas costs            |
|                                     |                                                        | false = someone else pays for the gas when transporting the withdraw tx to mainnet         |
-->

### Admin Functions

Admin functions require xDai tokens on the xDai network. To get xDai you can either use a [faucet](https://www.xdaichain.com/for-users/get-xdai-tokens/xdai-faucet) or you can reach out on the [Streamr Discord #dev channel](https://discord.gg/gZAm8P7hK8).

Adding members using admin functions is not at feature parity with the member function `join`. The newly added member will not be granted publish permissions to the streams inside the Data Union. This will need to be done manually using, `streamr.grantPermission(stream_publish, user)`. Similarly, after removing a member using the admin function `removeMembers`, the publish permissions will need to be removed in a secondary step using `revokePermission(permissionId)`.

| Name                              | Returns             | Description                                                    |
| :-------------------------------- | :------------------ | :------------------------------------------------------------- |
| createSecret(\[name])             | string              | Create a secret for a Data Union                               |
| addMembers(memberAddressList)     | Transaction receipt | Add members                                                    |
| removeMembers(memberAddressList)  | Transaction receipt | Remove members from Data Union                                 |
| setAdminFee(newFeeFraction)       | Transaction receipt | `newFeeFraction` is a `Number` between 0.0 and 1.0 (inclusive) |
| withdrawAllToMember(memberAddress\[, [options](#withdraw-options)\])                              | Transaction receipt `*` | Send all withdrawable earnings to the member's address |
| withdrawAllToSigned(memberAddress, recipientAddress, signature\[, [options](#withdraw-options)\]) | Transaction receipt `*` | Send all withdrawable earnings to the address signed off by the member (see [example below](#member-functions)) |
| withdrawAmountToSigned(memberAddress, recipientAddress, amountTokenWei, signature\[, [options](#withdraw-options)\]) | Transaction receipt `*` | Send some of the withdrawable earnings to the address signed off by the member |

`*` The return value type may vary depending on [the given options](#withdraw-options) that describe the use case.<br>

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
| part()                                                                | Transaction receipt       | Leave the Data Union
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

const dataUnion = await client.getDataUnion(dataUnionAddress)
const signature = await dataUnion.signWithdrawAllTo(recipientAddress)
```

Later, anyone (e.g. Data Union admin) can send that withdraw transaction to the blockchain (and pay for the gas)

```js
import { StreamrClient } from 'streamr-client'

const client = new StreamrClient({
    auth: { privateKey },
})

const dataUnion = await client.getDataUnion(dataUnionAddress)
const receipt = await dataUnion.withdrawAllToSigned(memberAddress, recipientAddress, signature)
```

The `messageHash` argument to `transportMessage` will come from the withdraw function with the specific options. The following is equivalent to the above withdraw line:
```js
const messageHash = await dataUnion.withdrawAllToSigned(memberAddress, recipientAddress, signature, {
    payForTransport: false,
    waitUntilTransportIsComplete: false,
}) // only pay for sidechain gas
const receipt = await dataUnion.transportMessage(messageHash) // only pay for mainnet gas
```

### Query functions

These are available for everyone and anyone, to query publicly available info from a Data Union:

| Name                                                       | Returns                                        | Description                             |
| :--------------------------------------------------------- | :--------------------------------------------- | :-------------------------------------- |
| getStats()                                                 | {activeMemberCount, totalEarnings, ...}        | Get Data Union's statistics             |
| getMemberStats(memberAddress)                              | {status, totalEarnings, withdrawableEarnings}  | Get member's stats                      |
| getWithdrawableEarnings(memberAddress)                     | `BigNumber` withdrawable DATA tokens in the DU |                                         |
| getAdminFee()                                              | `Number` between 0.0 and 1.0 (inclusive)       | Admin's cut from revenues               |
| getAdminAddress()                                          | Ethereum address                               | Data union admin's address              |
| getVersion()                                               | `0`, `1` or `2`                                | `0` if the contract is not a data union |

Here's an example how to get a member's withdrawable token balance (in "wei", where 1 DATA = 10^18 wei)

```js
import { StreamrClient } from 'streamr-client'

const client = new StreamrClient()
const dataUnion = await client.getDataUnion(dataUnionAddress)
const withdrawableWei = await dataUnion.getWithdrawableEarnings(memberAddress)
```

### Withdraw options

The functions `withdrawAll`, `withdrawAllTo`, `withdrawAllToMember`, `withdrawAllToSigned`, `withdrawAmountToSigned` all can take an extra "options" argument. It's an object that can contain the following parameters:

| Name              | Default               | Description                                                                               |
| :---------------- | :-------------------- | :--------------------------------------------------------------------------------------   |
| sendToMainnet     | true                  | Whether to send the withdrawn DATA tokens to mainnet address (or sidechain address)       |
| payForTransport   | true                  | Whether to pay for the withdraw transaction signature transport to mainnet over the bridge|
| waitUntilTransportIsComplete | true       | Whether to wait until the withdrawn DATA tokens are visible in mainnet                    |
| pollingIntervalMs | 1000 (1&nbsp;second)  | How often requests are sent to find out if the withdraw has completed                     |
| retryTimeoutMs    | 60000 (1&nbsp;minute) | When to give up when waiting for the withdraw to complete                                 |
| gasPrice          | network estimate      | Ethereum Mainnet transaction gas price to use when transporting tokens over the bridge    |

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
| getTokenBalance(address)                | `Promise<BigNumber>`             | Mainnet DATA token balance |
| getSidechainTokenBalance(address)       | `Promise<BigNumber>`             | Sidechain DATA token balance |
| client.getAddress() | `Promise<string>` | The client's Ethereum address

`*` The static function `StreamrClient.generateEthereumAccount()` generates a new
Ethereum private key and returns an object with fields `address` and `privateKey`.
Note that this private key can be used to authenticate to the Streamr API
by passing it in the authentication options, as described earlier in this document.

## Events
> ⚠️ Events for `streamr-client` seem to be used internally and the very few that remain should not be of use to users.

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
    id: `${await client.getAddress()}/partitioned-stream`,
    partitions: 10,
})
console.log(`Stream created: ${stream.id}. It has ${stream.partitions} partitions.`)
```

### Publishing to partitioned streams

In most use cases, a user wants related events (e.g. events from a particular device) to be assigned to the same partition, so that the events retain a deterministic order and reach the same subscriber(s) to allow them to compute stateful aggregates correctly.

The library allows the user to choose a _partition key_, which simplifies publishing to partitioned streams by not requiring the user to assign a partition number explicitly. The same partition key always maps to the same partition. In an IoT use case, the device id can be used as partition key; in user interaction data it could be the user id, and so on.

The partition key can be given as an argument to the `publish` methods, and the library assigns a deterministic partition number automatically:

```js
// msg.vehicleId being the partition key
await client.publish(STREAM_ID, msg, Date.now(), msg.vehicleId)

// or, equivalently, using the stream object
await stream.publish(msg, Date.now(), msg.vehicleId)
```

### Subscribing to partitioned streams

By default, the JS client subscribes to the first partition (partition `0`) in a stream. The partition number can be explicitly given in the subscribe call:

```js
const sub = await client.subscribe({
    id: STREAM_ID,
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
        id: STREAM_ID,
        partition,
    }, handler)
}))
```

## Proxy publishing

In some cases the client might be interested in publishing data without participating in the stream's message propagation. With this option the nodes can sign all messages they publish by themselves. Alternatively, a client could open a WS connection to a broker node and allow the broker to handle signing with its private key.

Proxy publishing is done on the network overlay level. This means that there is no need to know the IP address of the node that will be used as a proxy. Instead, the node needs to know the ID of the network node it wants to connect to. It is not possible to set publish proxies for a stream that is already being "traditionally" subscribed or published to and vice versa.

```js
// Open publish proxy to a node on stream
await publishingClient.setPublishProxy(stream, 'proxyNodeId')

// Open publish proxy to multiple nodes on stream
await publishingClient.setPublishProxies(stream, ['proxyNodeId1', 'proxyNodeId2'])

// Remove publish proxy to a node on stream
await publishingClient.removePublishProxy(stream, proxyNodeId1)

// Remove publish proxy to multiple nodes on stream
await publishingClient.removePublishProxies(stream, ['proxyNodeId1', 'proxyNodeId2'])
```

IMPORTANT: The node that is used as a proxy must have set the option on the network layer to accept incoming proxy connections.

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
