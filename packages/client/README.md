<p align="center">
  <a href="https://streamr.network">
    <img alt="Streamr" src="https://raw.githubusercontent.com/streamr-dev/network-monorepo/main/packages/client/readme-header-img.png" width="1320" />
  </a>
</p>

<h1 align="left">
  Streamr JavaScript Client
</h1>

[![Build status](https://github.com/streamr-dev/monorepo/actions/workflows/client-build.yml/badge.svg)](https://github.com/streamr-dev/monorepo/actions/workflows/client-build.yml)
[![latest npm package version](https://img.shields.io/npm/v/streamr-client?label=latest)
[![GitHub stars](https://img.shields.io/github/stars/streamr-dev/network-monorepo?style=social)
[![Discord Chat](https://img.shields.io/discord/801574432350928907.svg?label=Discord&logo=Discord&colorB=7289da)](https://discord.gg/FVtAph9cvz)

This library allows you to easily interact with the [Streamr Network](https://streamr.network) from JavaScript-based environments, such as browsers and [node.js](https://nodejs.org). The library wraps a Streamr light node for publishing and subscribing to data, as well as contains convenience functions for creating and managing streams.

Please see the [Streamr project docs](https://streamr.network/docs) for more detailed documentation.

## Contents
- Important information
- Get Started
    - Subscribing to a stream
    - Creating & publishing to a stream
- Setup
    - Installation
    - Importing `streamr-client`
- Usage
    - Client Creation
        - Authentication
    - Creating a stream 
    - Subscribing to real-time events in a stream
    - Publishing data points to a stream
    - Resend functionality with subscriptions
    - Search Streams
    - Interacting with the `Stream` object
        - Fetching existent streams
        - Updating a stream
        - Stream Permissions
        - Deleting a stream
    - Storage Options
    - Data Unions
        - Admin Functions
        - Member functions
        - Query functions
        - Withdraw options
        - Deployment options
    - Utility functions
- Advanced Usage
    - Manual connection management
    - Disable message ordering
    - Stream Partitioning
        - A note on Stream ids and partitions
        - Creating partitioned streams
        - Publishing to partitioned streams
        - Subscribing to partitioned streams
    - Proxy publishing
    - Logging

## Important information
> ⚠️ This section is to be removed before launch 

The current stable version of the Streamr Client is `5.x` (at the time of writing, February 2022) which is connected to the [Corea Network](https://streamr.network/roadmap). The Brubeck Network Streamr Client is the [6.0.0-beta.3](https://www.npmjs.com/package/streamr-client/v/6.0.0-beta.3) build along with the `testnet` builds of the Broker node. The developer experience of the two networks is the same, however, the `6.0.0-beta.3` client also runs as a light node in the network, whereas the `5.x` era client communicates remotely to a Streamr run node. When the Streamr Network transitions into the Brubeck era (ETA Jan/Feb 2022), data guarantees of `5.x` clients will need to be reassessed. Publishing data to the Brubeck network will only be visible in the [Brubeck Core UI](https://brubeck.streamr.network). The Marketplace, Core app and CLI tool are currently all configured to interact with the Corea Network only. Take care not to mix networks during this transition period.

---


## Get Started
Here are some usage examples. More examples can be found [here](https://github.com/streamr-dev/examples).

> In Streamr, Ethereum accounts are used for identity. You can generate an Ethereum private key using any Ethereum wallet, or you can use the utility function `StreamrClient.generateEthereumAccount()`, which returns the address and private key of a fresh Ethereum account.


### Subscribing to a stream
```js 

client.subscribe(streamId, (message) => {
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
___


## Setup

### Installation
The client is available on [npm](https://www.npmjs.com/package/streamr-client) and can be installed simply by:

```
npm install streamr-client
```

### Importing `streamr-client`
To use with react please see [streamr-client-react](https://github.com/streamr-dev/streamr-client-react)


If using typescript you can import the library with:
```js
import { StreamrClient } from 'streamr-client'
```
When using Node.js you can import the library with:

```js
const { StreamrClient } = require('streamr-client')
```

For usage in the browser include the latest build, e.g. by including a `<script>` tag pointing at a CDN:

```html
<!-- for Brubeck package (6x) -->
<script src="https://unpkg.com/streamr-client@beta/streamr-client.web.js"></script>
```
___
## Usage
### Client Creation
#### Authentication
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
    streamId, 
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
await client.unsubscribe(streamId)
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
await client.publish(streamId, msg)

// The first argument can also be the stream object
await client.publish(stream, msg)

// Publish with a specific timestamp as a Date object (default is now)
await client.publish(streamId, msg, new Date(54365472))

// Publish with a specific timestamp in ms
await client.publish(streamId, msg, 54365472)

// Publish with a specific timestamp as a ISO8601 string
await client.publish(streamId, msg, '2019-01-01T00:00:00.123Z')

// For convenience, stream.publish(...) equals client.publish(stream, ...)
await stream.publish(msg)
```

### Resend functionality with subscriptions
By default `subscribe` will not resend historical data, only subscribe to real time messages. In order to fetch historical messages the stream needs to have [storage enabled](#storage).

Note that only one of the resend options can be used for a particular subscription. The default functionality is to resend nothing, only subscribe to messages from the subscription moment onwards.

One can either fetch the historical sent messages with the `resend` method:
```js
// Fetches the last 10 messages stored for the stream
const resend1 = await client.resend(
    streamId,
    {
        last: 10,
    }, 
    messageCallback
)
```

Or fetch them and subscribe to new messages in the same call via a `subscribe` call:
```js
// Fetches the last 10 messages and subscribes to the stream
const sub1 = await client.subscribe({
    id: streamId,
    resend: {
        last: 10,
    }
}, messageCallback)
```

Resend from a specific message reference up to the newest message:
```js
const sub2 = await client.subscribe({
    id: streamId,
    resend: {
        from: {
            timestamp: (Date.now() - 1000 * 60 * 5), // 5 minutes ago
        },
        publisher: '0x12345...', // optional
    }
}, onMessage)
```
Resend a limited range of messages:
```js
const sub3 = await client.subscribe({
    id: streamId,
    resend: {
        from: {
            timestamp: (Date.now() - 1000 * 60 * 10), // 10 minutes ago
        },
        to: {
            timestamp: (Date.now() - 1000 * 60 * 5), // 5 minutes ago
        },
        // when using from and to the following parameters are optional
        // but, if specified, both must be present
        publisher: '0x12345...', 
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
You can search for a stream which has the `term` string in it's id as follows:
```js
const streams = await client.searchStreams('foo')
```
You can query for the streams using an optional second parameter to fine-tune your search. A permission query searches over stream permissions. You can either query by direct permissions (which are explicitly granted to a user), or by all permissions (including public permissions, which apply to all users).

To get all streams where a user has some direct permission. The `user` option can be omitted. In that case, it defaults to the authenticated user:
```js 
const streams = await client.searchStreams('foo', {
    user: '0x12345...'
})
// Or, to query for all the streams accessible by the user
const streams = await client.searchStreams('foo', {
    user: '0x12345...',
    allowPublic: true
})
```

It is also possible to filter by specific permissions by using `allOf` and `anyOf` flags. Please prefer `allOf` to `anyOf` when possible as it has better query performance.

If you want to find the streams you can exclusively subscribe to:
```js 
const streams = await client.searchStreams('foo', {
    user: '0x12345...',
    allOf: [StreamPermission.SUBSCRIBE],
})
```
If you want to find any streams you can publish to, regardless of the other permissions assigned:
```js
const streams = await client.searchStreams('foo', {
    user: '0x12345...',
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
### Interacting with the `Stream` object

#### Fetching existent streams
Getting an existent stream is pretty straight-forward
```js
const stream = await client.getStream(streamId)
```

The method getOrCreateStream allows for a seamless creation/fetching process:
```js
// May require gas upon stream creation
const stream = await client.getOrCreateStream({
    id: streamId
})
```

#### Updating a stream
Updates the description locally set for the stream
```js
stream.description = 'New description!'
await stream.update()
```

#### Stream Permissions

There are 5 different permissions:
- StreamPermission.PUBLISH
- StreamPermission.SUBSCRIBE
- StreamPermission.EDIT
- StreamPermission.DELETE
- StreamPermission.GRANT

You can import the `StreamPermission` enum with:
```js
const { StreamPermission } = require('streamr-client')
```

For each stream + user there can be a permission assignment containing a subset of those permissions. It is also possible to grant public permissions for streams (only `StreamPermission.PUBLISH` and `StreamPermission.SUBSCRIBE`). If a stream has e.g. a public subscribe permissions, it means that anyone can subscribe to that stream.


To grant permissions for users:
```js
await stream.grantPermissions({
    user: '0x12345...',
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
    user: '0x12345...',
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
            user: '0x12345...',
            permissions: [StreamPermission.EDIT]
        }, {
            user: '0x6789a...',
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
    user: '0x12345...',
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
        { user: '0x12345...', permissions: ['subscribe', 'publish'] },
        { public: true, permissions: ['subscribe']}
    ]
```


#### Deleting a stream
Deletes the stream from the on-chain registry:
```js
// Requires gas
await stream.delete()
```



### Storage Options

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


### Data Unions

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

#### Admin Functions

Admin functions require xDai tokens on the xDai network. To get xDai you can either use a [faucet](https://www.xdaichain.com/for-users/get-xdai-tokens/xdai-faucet) or you can reach out on the [Streamr Discord #dev channel](https://discord.gg/gZAm8P7hK8).

Adding members using admin functions is not at feature parity with the member function `join`. The newly added member will not be granted publish permissions to the streams inside the Data Union. This will need to be done manually using, `streamr.grantPermissions()`. Similarly, after removing a member using the admin function `removeMembers`, the publish permissions will need to be removed in a secondary step using `revokePermissions()`.

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
const { StreamrClient } = require('streamr-client')

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

#### Member functions

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
const { StreamrClient } = require('streamr-client')

const client = new StreamrClient({
    auth: { privateKey },
})

const dataUnion = await client.getDataUnion(dataUnionAddress)
const signature = await dataUnion.signWithdrawAllTo(recipientAddress)
```

Later, anyone (e.g. Data Union admin) can send that withdraw transaction to the blockchain (and pay for the gas)

```js
const { StreamrClient } = require('streamr-client')

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

#### Query functions

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
const { StreamrClient } = require('streamr-client')

const client = new StreamrClient()
const dataUnion = await client.getDataUnion(dataUnionAddress)
const withdrawableWei = await dataUnion.getWithdrawableEarnings(memberAddress)
```

#### Withdraw options

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

#### Deployment options

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

### Utility functions
The static function `StreamrClient.generateEthereumAccount()` generates a new Ethereum private key and returns an object with fields `address` and `privateKey`. Note that this private key can be used to authenticate to the Streamr API by passing it in the authentication options, as described earlier in this document.
```js 
const wallet = StreamrClient.generateEthereumAccount()
```
Generates a random Ethereum account object:
```js
    wallet = {address, privateKey}
```
In order to retrieve the client's address an async call must me made to `client.getAddress`
```js
const address = await client.getAddress()
```

## Advanced Usage


### Manual connection management

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


### Disable message ordering
If your use-case doesn't require message order to be enforced or if you want it to be tolerant to out-of-sync messages you can turn off the message ordering upon client creation:
```js
const client = new StreamrClient({
    auth: { ... },
    orderMessages: false,
    gapFill: false
})
```
Both of these flags should be disabled in tandem for message ordering to be properly turned off.

By disabling message ordering your application won't perform any filling nor sorting, dispatching messages as they come (faster) but without granting their collective integrity.

### Stream Partitioning

Partitioning (sharding) enables streams to scale horizontally. This section describes how to use partitioned streams via this library. To learn the basics of partitioning, see [the docs](https://streamr.network/docs/streams#partitioning).

#### A note on Stream ids and partitions
The public methods of the client generally support the following three ways of defining a stream:
```js
Stream id as a string:
const streamId = `${address}/foo/bar`

// Stream id + partition as a string
const streamId = `${address}/foo/bar#4`

// Stream id + partition as an object
const streamId = { 
    id: `${address}/foo/bar`, 
    partition: 4 
}
```


    


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
await client.publish(streamId, msg, Date.now(), msg.vehicleId)
// or, equivalently, using the stream object
await stream.publish(msg, Date.now(), msg.vehicleId)
```
You can also specify the partition number as the last parameter:
```js 
await client.publish(streamId, msg, Date.now(), 4)
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
    id: streamId,
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
        id: streamId,
        partition,
    }, messageCallback)
}))
```

### Proxy publishing

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

### Logging

The Streamr JS client library supports [debug](https://github.com/visionmedia/debug) for logging.

In node.js, start your app like this: `DEBUG=StreamrClient* node your-app.js`

In the browser, set `localStorage.debug = 'StreamrClient*'`
