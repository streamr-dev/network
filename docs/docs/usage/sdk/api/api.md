# API reference

## Type Aliases

### BrandedString\<T\>

> **BrandedString**\<`T`\>: `string` & `object`

#### Type declaration

##### \_\_brand

> **\_\_brand**: `T`

#### Type Parameters

• **T**

***

### DhtAddress

> **DhtAddress**: [`BrandedString`](api.md#brandedstringt)\<`"DhtAddress"`\>

***

### EnvironmentId

> **EnvironmentId**: `"polygon"` \| `"polygonAmoy"` \| `"dev2"`

***

### EthereumAddress

> **EthereumAddress**: [`BrandedString`](api.md#brandedstringt)\<`"EthereumAddress"`\>

***

### GapFillStrategy

> **GapFillStrategy**: `"light"` \| `"full"`

***

### LogLevel

> **LogLevel**: `"silent"` \| `"fatal"` \| `"error"` \| `"warn"` \| `"info"` \| `"debug"` \| `"trace"`

***

### MessageListener()

> **MessageListener**: (`content`, `metadata`) => `unknown` \| `Promise`\<`unknown`\>

#### Parameters

• **content**: `unknown`

• **metadata**: [`MessageMetadata`](api.md#messagemetadata)

#### Returns

`unknown` \| `Promise`\<`unknown`\>

***

### MessageMetadata

> **MessageMetadata**: `Omit`\<[`Message`](interfaces/Message.md), `"content"`\>

***

### MetricsDefinition

> **MetricsDefinition**: `Record`\<`string`, [`Metric`](classes/Metric.md)\>

***

### MetricsReport

> **MetricsReport**: `object` & `Record`\<`string`, `any`\>

#### Type declaration

##### period

> **period**: `object`

##### period.end

> **end**: `number`

##### period.start

> **start**: `number`

***

### PermissionAssignment

> **PermissionAssignment**: [`UserPermissionAssignment`](interfaces/UserPermissionAssignment.md) \| [`PublicPermissionAssignment`](interfaces/PublicPermissionAssignment.md)

***

### PermissionQuery

> **PermissionQuery**: [`UserPermissionQuery`](interfaces/UserPermissionQuery.md) \| [`PublicPermissionQuery`](interfaces/PublicPermissionQuery.md)

***

### ResendOptions

> **ResendOptions**: [`ResendLastOptions`](interfaces/ResendLastOptions.md) \| [`ResendFromOptions`](interfaces/ResendFromOptions.md) \| [`ResendRangeOptions`](interfaces/ResendRangeOptions.md)

The supported resend types.

***

### SignerWithProvider

> **SignerWithProvider**: `AbstractSigner`\<`Provider`\>

***

### StreamDefinition

> **StreamDefinition**: `string` \| `object` \| `object` \| `object`

***

### StreamID

> **StreamID**: [`BrandedString`](api.md#brandedstringt)\<`"StreamID"`\>

***

### StreamMessageAESEncrypted

> **StreamMessageAESEncrypted**: [`StreamMessage`](classes/StreamMessage.md) & `object`

Encrypted StreamMessage.

#### Type declaration

##### encryptionType

> **encryptionType**: [`AES`](enumerations/EncryptionType.md#aes)

##### groupKeyId

> **groupKeyId**: `string`

***

### StreamMetadata

> **StreamMetadata**: `Record`\<`string`, `unknown`\>

***

### StreamPartID

> **StreamPartID**: [`BrandedString`](api.md#brandedstringt)\<`"StreamPartID"`\>

***

### StrictStreamrClientConfig

> **StrictStreamrClientConfig**: `MarkOptional`\<`Required`\<[`StreamrClientConfig`](interfaces/StreamrClientConfig.md)\>, `"environment"` \| `"auth"` \| `"metrics"`\> & `object`

#### Type declaration

##### cache

> **cache**: `Exclude`\<`Required`\<[`StreamrClientConfig`](interfaces/StreamrClientConfig.md)\[`"cache"`\]\>, `undefined`\>

##### contracts

> **contracts**: `Exclude`\<`Required`\<[`StreamrClientConfig`](interfaces/StreamrClientConfig.md)\[`"contracts"`\]\>, `undefined`\>

##### encryption

> **encryption**: `Exclude`\<`Required`\<[`StreamrClientConfig`](interfaces/StreamrClientConfig.md)\[`"encryption"`\]\>, `undefined`\>

##### network

> **network**: `Exclude`\<`Required`\<[`StreamrClientConfig`](interfaces/StreamrClientConfig.md)\[`"network"`\]\>, `undefined`\>

***

### SubscribeOptions

> **SubscribeOptions**: [`StreamDefinition`](api.md#streamdefinition) & [`ExtraSubscribeOptions`](interfaces/ExtraSubscribeOptions.md)

***

### UserID

> **UserID**: [`BrandedString`](api.md#brandedstringt)\<`"UserID"`\>

## Variables

### DEFAULT\_ENVIRONMENT\_ID

> `const` **DEFAULT\_ENVIRONMENT\_ID**: [`EnvironmentId`](api.md#environmentid) = `'polygon'`

***

### ENVIRONMENT\_IDS

> `const` **ENVIRONMENT\_IDS**: [`EnvironmentId`](api.md#environmentid)[]

***

### OperatorDiscoveryRequest

> **OperatorDiscoveryRequest**: `OperatorDiscoveryRequest$Type`

#### Generated

MessageType for protobuf message OperatorDiscoveryRequest

***

### OperatorDiscoveryResponse

> **OperatorDiscoveryResponse**: `OperatorDiscoveryResponse$Type`

#### Generated

MessageType for protobuf message OperatorDiscoveryResponse

***

### PeerDescriptor

> **PeerDescriptor**: `PeerDescriptor$Type`

#### Generated

MessageType for protobuf message peerDescriptor.PeerDescriptor

***

### STREAMR\_STORAGE\_NODE\_GERMANY

> `const` **STREAMR\_STORAGE\_NODE\_GERMANY**: `"0x31546eEA76F2B2b3C5cC06B1c93601dc35c9D916"` = `'0x31546eEA76F2B2b3C5cC06B1c93601dc35c9D916'`

## Functions

### convertBytesToStreamMessage()

> **convertBytesToStreamMessage**(`bytes`): [`StreamMessage`](classes/StreamMessage.md)

#### Parameters

• **bytes**: `Uint8Array`

#### Returns

[`StreamMessage`](classes/StreamMessage.md)

***

### convertStreamMessageToBytes()

> **convertStreamMessageToBytes**(`oldStreamMessage`): `Uint8Array`

#### Parameters

• **oldStreamMessage**: [`StreamMessage`](classes/StreamMessage.md)

#### Returns

`Uint8Array`

***

### formStorageNodeAssignmentStreamId()

> **formStorageNodeAssignmentStreamId**(`clusterAddress`): [`StreamID`](api.md#streamid)

#### Parameters

• **clusterAddress**: `string`

#### Returns

[`StreamID`](api.md#streamid)

***

### peerDescriptorTranslator()

> **peerDescriptorTranslator**(`json`): [`PeerDescriptor`](interfaces/PeerDescriptor.md)

#### Parameters

• **json**: [`NetworkPeerDescriptor`](interfaces/NetworkPeerDescriptor.md)

#### Returns

[`PeerDescriptor`](interfaces/PeerDescriptor.md)

## Enumerations

- [ContentType](enumerations/ContentType.md)
- [EncryptionType](enumerations/EncryptionType.md)
- [NetworkNodeType](enumerations/NetworkNodeType.md)
- [ProxyDirection](enumerations/ProxyDirection.md)
- [SignatureType](enumerations/SignatureType.md)
- [StreamMessageType](enumerations/StreamMessageType.md)
- [StreamPermission](enumerations/StreamPermission.md)

## Classes

### Important

- [Stream](classes/Stream.md)
- [StreamrClient](classes/StreamrClient.md)
- [Subscription](classes/Subscription.md)

### Other

- [EncryptedGroupKey](classes/EncryptedGroupKey.md)
- [EncryptionKey](classes/EncryptionKey.md)
- [MessageID](classes/MessageID.md)
- [MessageRef](classes/MessageRef.md)
- [MessageStream](classes/MessageStream.md)
- [Metric](classes/Metric.md)
- [MetricsContext](classes/MetricsContext.md)
- [StreamMessage](classes/StreamMessage.md)

## Interfaces

### Important

- [Message](interfaces/Message.md)
- [StreamrClientConfig](interfaces/StreamrClientConfig.md)

### Other

- [ConnectionInfo](interfaces/ConnectionInfo.md)
- [ConnectivityMethod](interfaces/ConnectivityMethod.md)
- [ControlLayerConfig](interfaces/ControlLayerConfig.md)
- [Eip1193Provider](interfaces/Eip1193Provider.md)
- [EntryPointDiscovery](interfaces/EntryPointDiscovery.md)
- [EthereumNetworkConfig](interfaces/EthereumNetworkConfig.md)
- [ExtraSubscribeOptions](interfaces/ExtraSubscribeOptions.md)
- [IceServer](interfaces/IceServer.md)
- [NetworkConfig](interfaces/NetworkConfig.md)
- [NetworkNodeConfig](interfaces/NetworkNodeConfig.md)
- [NetworkPeerDescriptor](interfaces/NetworkPeerDescriptor.md)
- [OperatorDiscoveryRequest](interfaces/OperatorDiscoveryRequest.md)
- [OperatorDiscoveryResponse](interfaces/OperatorDiscoveryResponse.md)
- [Overrides](interfaces/Overrides.md)
- [PeerDescriptor](interfaces/PeerDescriptor.md)
- [PortRange](interfaces/PortRange.md)
- [PrivateKeyAuthConfig](interfaces/PrivateKeyAuthConfig.md)
- [ProviderAuthConfig](interfaces/ProviderAuthConfig.md)
- [PublicPermissionAssignment](interfaces/PublicPermissionAssignment.md)
- [PublicPermissionQuery](interfaces/PublicPermissionQuery.md)
- [PublishMetadata](interfaces/PublishMetadata.md)
- [ResendFromOptions](interfaces/ResendFromOptions.md)
- [ResendLastOptions](interfaces/ResendLastOptions.md)
- [ResendRangeOptions](interfaces/ResendRangeOptions.md)
- [ResendRef](interfaces/ResendRef.md)
- [SearchStreamsOrderBy](interfaces/SearchStreamsOrderBy.md)
- [SearchStreamsPermissionFilter](interfaces/SearchStreamsPermissionFilter.md)
- [Signer](interfaces/Signer.md)
- [StorageNodeAssignmentEvent](interfaces/StorageNodeAssignmentEvent.md)
- [StorageNodeMetadata](interfaces/StorageNodeMetadata.md)
- [StreamCreationEvent](interfaces/StreamCreationEvent.md)
- [StreamMessageOptions](interfaces/StreamMessageOptions.md)
- [StreamrClientEvents](interfaces/StreamrClientEvents.md)
- [SubscriptionEvents](interfaces/SubscriptionEvents.md)
- [UpdateEncryptionKeyOptions](interfaces/UpdateEncryptionKeyOptions.md)
- [UserPermissionAssignment](interfaces/UserPermissionAssignment.md)
- [UserPermissionQuery](interfaces/UserPermissionQuery.md)
