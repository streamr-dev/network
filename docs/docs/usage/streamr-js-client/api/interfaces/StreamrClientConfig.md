---
id: "StreamrClientConfig"
title: "Interface: StreamrClientConfig"
sidebar_label: "StreamrClientConfig"
sidebar_position: 0
custom_edit_url: null
---

## Properties

### auth

• `Optional` **auth**: [`PrivateKeyAuthConfig`](PrivateKeyAuthConfig.md) \| [`ProviderAuthConfig`](ProviderAuthConfig.md)

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
| `rsaKeyLength?` | `number` | Defines how strong RSA key, in bits, is used when an encryption key is requested via the standard Streamr key-exchange. |

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

• `Optional` **network**: [`NetworkConfig`](NetworkConfig.md)

Config for the decentralized network layer.

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
