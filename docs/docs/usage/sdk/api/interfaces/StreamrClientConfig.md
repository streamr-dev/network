# Interface: StreamrClientConfig

## Properties

### auth?

> `optional` **auth**: [`PrivateKeyAuthConfig`](PrivateKeyAuthConfig.md) \| [`ProviderAuthConfig`](ProviderAuthConfig.md)

The Ethereum identity to be used by the client. Either a private key
or a window.ethereum object.

***

### cache?

> `optional` **cache**: `object`

Determines caching behaviour for certain repeated smart contract queries.

#### maxAge?

> `optional` **maxAge**: `number`

#### maxSize?

> `optional` **maxSize**: `number`

***

### contracts?

> `optional` **contracts**: `object`

#### ethereumNetwork?

> `optional` **ethereumNetwork**: [`EthereumNetworkConfig`](EthereumNetworkConfig.md)

#### maxConcurrentCalls?

> `optional` **maxConcurrentCalls**: `number`

#### pollInterval?

> `optional` **pollInterval**: `number`

#### rpcQuorum?

> `optional` **rpcQuorum**: `number`

#### rpcs?

> `optional` **rpcs**: [`ConnectionInfo`](ConnectionInfo.md)[]

#### storageNodeRegistryChainAddress?

> `optional` **storageNodeRegistryChainAddress**: `string`

#### streamRegistryChainAddress?

> `optional` **streamRegistryChainAddress**: `string`

#### streamStorageRegistryChainAddress?

> `optional` **streamStorageRegistryChainAddress**: `string`

#### theGraphUrl?

> `optional` **theGraphUrl**: `string`

Some TheGraph instance, that indexes the streamr registries

***

### encryption?

> `optional` **encryption**: `object`

Controls how messages encryption and decryption should be handled and
how encryption keys should be exchanged.

#### keyRequestTimeout?

> `optional` **keyRequestTimeout**: `number`

When requesting an encryption key using the standard Streamr
key-exchange system, defines how many milliseconds should a response
be awaited for.

#### litProtocolEnabled?

> `optional` **litProtocolEnabled**: `boolean`

Enable experimental Lit Protocol key exchange.

When enabled encryption key storing and fetching will primarily be done through the
[Lit Protocol](https://litprotocol.com/) and secondarily through the standard Streamr
key-exchange system.

#### litProtocolLogging?

> `optional` **litProtocolLogging**: `boolean`

Enable log messages of the Lit Protocol library to be printed to stdout.

#### maxKeyRequestsPerSecond?

> `optional` **maxKeyRequestsPerSecond**: `number`

The maximum amount of encryption key requests that should be sent via
the standard Streamr key-exchange system per second.

In streams with 1000+ publishers, it is important to limit the amount
of control message traffic that gets generated to avoid network buffers
from overflowing.

#### rsaKeyLength?

> `optional` **rsaKeyLength**: `number`

Defines how strong RSA key, in bits, is used when an encryption key is
requested via the standard Streamr key-exchange.

***

### environment?

> `optional` **environment**: [`EnvironmentId`](../api.md#environmentid)

***

### gapFill?

> `optional` **gapFill**: `boolean`

Set to true to enable gap filling.

Some messages may occasionally not reach the client due to networking
issues. Missing messages form gaps that are often detectable and
retrievable on demand. By enabling gap filling, the client will detect
and fix gaps automatically for you.

***

### gapFillStrategy?

> `optional` **gapFillStrategy**: [`GapFillStrategy`](../api.md#gapfillstrategy)

When gap filling is enabled, this setting controls whether to enable a
lighter (default) or a full gap fill strategy.

While filling a gap, new gaps may emerge further along the message
chain. After a gap has been filled, the gap filling mechanism will
attend to the next gap until that has been resolved and so forth.

This is great in theory, but sometimes in practice, especially in
streams with heavy traffic, the gap filling mechanism may never catch
up leading to permanently increased latency, and even dropped messages
(due to buffer overflows) further exacerbating the presence of gaps.

With `light` strategy, when a gap cannot be successfully filled and
must be dropped, all subsequent accumulated gaps will be dropped as
well. This improves the ability to stay up-to-date at the cost of
potentially missing messages. With `full` strategy the subsequent gaps
will not be dropped.

***

### gapFillTimeout?

> `optional` **gapFillTimeout**: `number`

When gap filling is enabled and a gap is encountered, this option
defines the amount of time in milliseconds to wait before attempting to
_actively_ fill in the gap.

Rationale: data may just be arriving out-of-order and the missing
message(s) may be on their way. For efficiency, it makes sense to wait a
little before actively attempting to fill in a gap, as this involves
a resend request / response interaction with a storage node.

***

### id?

> `optional` **id**: `string`

Custom human-readable debug id for client. Used in logging.

***

### logLevel?

> `optional` **logLevel**: [`LogLevel`](../api.md#loglevel)

Override the default logging level.

***

### maxGapRequests?

> `optional` **maxGapRequests**: `number`

When gap filling is enabled, this option controls the maximum amount of
times a gap will try to be actively filled before giving up and
proceeding forwards.

***

### metrics?

> `optional` **metrics**: `boolean` \| `object`

Determines the telemetry metrics that are sent to the Streamr Network
at regular intervals.

By setting this to false, you disable the feature.

***

### network?

> `optional` **network**: [`NetworkConfig`](NetworkConfig.md)

Config for the decentralized network layer.

***

### orderMessages?

> `optional` **orderMessages**: `boolean`

Due to the distributed nature of the network, messages may occasionally
arrive to the client out-of-order. Set this option to `true` if you want
the client to reorder received messages to the intended order.

***

### retryResendAfter?

> `optional` **retryResendAfter**: `number`

When gap filling is enabled and a gap is encountered, a resend request
may eventually be sent to a storage node in an attempt to _actively_
fill in the gap. This option controls how long to wait for, in
milliseconds, for a resend response from the storage node before
proceeding to the next attempt.
