---
id: "StreamrClientConfig"
title: "Interface: StreamrClientConfig"
sidebar_label: "StreamrClientConfig"
sidebar_position: 0
custom_edit_url: null
---

## Properties

### auth

• `Optional` **auth**: [`ProviderAuthConfig`](ProviderAuthConfig.md) \| [`PrivateKeyAuthConfig`](PrivateKeyAuthConfig.md)

The Ethereum identity to be used by the client. Either a private key
or a window.ethereum object.

___

### cache

• `Optional` **cache**: `Object`

Determines caching behaviour for certain repeated smart contract queries.

#### Type declaration

| Name | Type |
| :------ | :------ |
| `maxAge?` | `number` |
| `maxSize?` | `number` |

___

### contracts

• `Optional` **contracts**: `Object`

The smart contract addresses and RPC urls to be used in the client.
Generally not intended to be configured by the end-user unless a
custom network is being formed.

#### Type declaration

| Name | Type | Description |
| :------ | :------ | :------ |
| `ethereumNetworks?` | `Record`<`string`, [`EthereumNetworkConfig`](EthereumNetworkConfig.md)\> | - |
| `mainChainRPCs?` | [`ChainConnectionInfo`](ChainConnectionInfo.md) | - |
| `maxConcurrentCalls?` | `number` | - |
| `pollInterval?` | `number` | - |
| `storageNodeRegistryChainAddress?` | `string` | - |
| `streamRegistryChainAddress?` | `string` | - |
| `streamRegistryChainRPCs?` | [`ChainConnectionInfo`](ChainConnectionInfo.md) | - |
| `streamStorageRegistryChainAddress?` | `string` | - |
| `theGraphUrl?` | `string` | Some TheGraph instance, that indexes the streamr registries |

___

### encryption

• `Optional` **encryption**: `Object`

Controls how messages encryption and decryption should be handled and
how encryption keys should be exchanged.

#### Type declaration

| Name | Type | Description |
| :------ | :------ | :------ |
| `keyRequestTimeout?` | `number` | When requesting an encryption key using the standard Streamr key-exchange system, defines how many milliseconds should a response be awaited for. |
| `litProtocolEnabled?` | `boolean` | Enable experimental Lit Protocol key exchange. When enabled encryption key storing and fetching will primarily be done through the [Lit Protocol](https://litprotocol.com/) and secondarily through the standard Streamr key-exchange system. |
| `litProtocolLogging?` | `boolean` | Enable log messages of the Lit Protocol library to be printed to stdout. |
| `maxKeyRequestsPerSecond?` | `number` | The maximum amount of encryption key requests that should be sent via the standard Streamr key-exchange system per second. In streams with 1000+ publishers, it is important to limit the amount of control message traffic that gets generated to avoid network buffers from overflowing. |

___

### gapFill

• `Optional` **gapFill**: `boolean`

Set to true to enable gap filling.

Some messages may occasionally not reach the client due to networking
issues. Missing messages form gaps that are often detectable and
retrievable on demand. By enabling gap filling, the client will detect
and fix gaps automatically for you.

___

### gapFillTimeout

• `Optional` **gapFillTimeout**: `number`

When gap filling is enabled and a gap is encountered, this option
defines the amount of time in milliseconds to wait before attempting to
_actively_ fill in the gap.

Rationale: data may just be arriving out-of-order and the missing
message(s) may be on their way. For efficiency, it makes sense to wait a
little before actively attempting to fill in a gap, as this involves
a resend request / response interaction with a storage node.

___

### id

• `Optional` **id**: `string`

Custom human-readable debug id for client. Used in logging.

___

### logLevel

• `Optional` **logLevel**: [`LogLevel`](../index.md#loglevel)

Override the default logging level.

___

### maxGapRequests

• `Optional` **maxGapRequests**: `number`

When gap filling is enabled, this option controls the maximum amount of
times a gap will try to be actively filled before giving up and
proceeding forwards.

___

### metrics

• `Optional` **metrics**: `boolean` \| { `maxPublishDelay?`: `number` ; `periods?`: { `duration`: `number` ; `streamId`: `string`  }[]  }

Determines the telemetry metrics that are sent to the Streamr Network
at regular intervals.

By setting this to false, you disable the feature.

___

### network

• `Optional` **network**: `Object`

These settings determine how the client performs and interacts with the
Streamr Network.

#### Type declaration

| Name | Type | Description |
| :------ | :------ | :------ |
| `acceptProxyConnections?` | `boolean` | Whether to accept proxy connections. Enabling this option allows this network node to act as proxy on behalf of other nodes / clients. |
| `disconnectionWaitTime?` | `number` | Determines how long, in milliseconds, to keep non-relevant neighbor connections around for before disconnecting them. A connection with another node is relevant when the two share one or more streams and thus have messages to propagate to one another. When this no longer holds, the connection may be cut. During the topology re-organization process, sometimes a neighbor node may cease to be our neighbor only to become one once again in a short period of time. For this reason, it can be beneficial not to disconnect non-relevant neighbors right away. |
| `iceServers?` | readonly [`IceServer`](IceServer.md)[] | The list of STUN and TURN servers to use in ICE protocol when forming WebRTC connections. |
| `id?` | `string` | The network-wide identifier of this node. Should be unique within the Streamr Network. |
| `location?` | [`Location`](Location.md) | Defines an explicit geographic location for this node (overriding Geo IP lookup). |
| `newWebrtcConnectionTimeout?` | `number` | Defines WebRTC connection establishment timeout in milliseconds. When attempting to form a new connection, if not established within this timeout, the attempt is considered as failed and further waiting for it will cease. |
| `peerPingInterval?` | `number` | Defines how often, in milliseconds, to ping connected nodes to determine connection aliveness. |
| `rttUpdateTimeout?` | `number` | Determines how often, in milliseconds, at most, to include round-trip time (RTT) statistics in status updates to trackers. |
| `trackerConnectionMaintenanceInterval?` | `number` | Determines how often, in milliseconds, should tracker connections be maintained. This involves connecting to any relevant trackers to which a connection does not yet exist and disconnecting from irrelevant ones. |
| `trackerPingInterval?` | `number` | Defines how often, in milliseconds, to ping connected tracker(s) to determine connection aliveness. |
| `trackers?` | [`TrackerRegistryContract`](TrackerRegistryContract.md) \| [`TrackerRegistryRecord`](TrackerRegistryRecord.md)[] | Defines the trackers that should be used for peer discovery and connection forming. Generally not intended to be configured by the end-user unless a custom network is being formed. |
| `webrtcDatachannelBufferThresholdHigh?` | `number` | Sets the high-water mark used by send buffers of WebRTC connections. |
| `webrtcDatachannelBufferThresholdLow?` | `number` | Sets the low-water mark used by send buffers of WebRTC connections. |
| `webrtcDisallowPrivateAddresses?` | `boolean` | When set to true private addresses will not be probed when forming WebRTC connections. Probing private addresses can trigger false-positive incidents in some port scanning detection systems employed by web hosting providers. Disallowing private addresses may prevent direct connections from being formed between nodes using IPv4 addresses on a local network. Details: https://github.com/streamr-dev/network/wiki/WebRTC-private-addresses |
| `webrtcMaxMessageSize?` | `number` | The maximum outgoing message size (in bytes) accepted by WebRTC connections. Messages exceeding the maximum size are simply discarded. |
| `webrtcPortRange?` | [`WebRtcPortRange`](WebRtcPortRange.md) | Defines a custom UDP port range to be used for WebRTC connections. This port range should not be restricted by enclosing firewalls or virtual private cloud configurations. |
| `webrtcSendBufferMaxMessageCount?` | `number` | The maximum amount of messages retained in the send queue of a WebRTC connection. When the send queue becomes full, oldest messages are discarded first to make room for new. |

___

### orderMessages

• `Optional` **orderMessages**: `boolean`

Due to the distributed nature of the network, messages may occasionally
arrive to the client out-of-order. Set this option to `true` if you want
the client to reorder received messages to the intended order.

___

### retryResendAfter

• `Optional` **retryResendAfter**: `number`

When gap filling is enabled and a gap is encountered, a resend request
may eventually be sent to a storage node in an attempt to _actively_
fill in the gap. This option controls how long to wait for, in
milliseconds, for a resend response from the storage node before
proceeding to the next attempt.
