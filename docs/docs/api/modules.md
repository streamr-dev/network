---
id: "modules"
title: "⚙️ Streamr SDK"
sidebar_label: "Exports"
sidebar_position: 0.5
custom_edit_url: null
---

## Enumerations

- [ContentType](enums/ContentType.md)
- [EncryptionType](enums/EncryptionType.md)
- [ProxyDirection](enums/ProxyDirection.md)
- [StreamMessageType](enums/StreamMessageType.md)
- [StreamPermission](enums/StreamPermission.md)

## Important Classes

- [Stream](classes/Stream.md)
- [StreamrClient](classes/StreamrClient.md)
- [Subscription](classes/Subscription.md)

## Other Classes

- [EncryptedGroupKey](classes/EncryptedGroupKey.md)
- [EncryptionKey](classes/EncryptionKey.md)
- [MessageID](classes/MessageID.md)
- [MessageRef](classes/MessageRef.md)
- [MessageStream](classes/MessageStream.md)
- [Metric](classes/Metric.md)
- [MetricsContext](classes/MetricsContext.md)
- [StreamMessage](classes/StreamMessage.md)

## Important Interfaces

- [Message](interfaces/Message.md)
- [StreamrClientConfig](interfaces/StreamrClientConfig.md)

## Other Interfaces

- [ChainConnectionInfo](interfaces/ChainConnectionInfo.md)
- [EthereumNetworkConfig](interfaces/EthereumNetworkConfig.md)
- [ExtraSubscribeOptions](interfaces/ExtraSubscribeOptions.md)
- [Field](interfaces/Field.md)
- [IceServer](interfaces/IceServer.md)
- [Location](interfaces/Location.md)
- [NetworkNodeStub](interfaces/NetworkNodeStub.md)
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
- [StorageNodeAssignmentEvent](interfaces/StorageNodeAssignmentEvent.md)
- [StorageNodeMetadata](interfaces/StorageNodeMetadata.md)
- [StreamCreationEvent](interfaces/StreamCreationEvent.md)
- [StreamMessageOptions](interfaces/StreamMessageOptions.md)
- [StreamMetadata](interfaces/StreamMetadata.md)
- [StreamrClientEvents](interfaces/StreamrClientEvents.md)
- [SubscriptionEvents](interfaces/SubscriptionEvents.md)
- [TrackerRegistryContract](interfaces/TrackerRegistryContract.md)
- [TrackerRegistryRecord](interfaces/TrackerRegistryRecord.md)
- [UpdateEncryptionKeyOptions](interfaces/UpdateEncryptionKeyOptions.md)
- [UserPermissionAssignment](interfaces/UserPermissionAssignment.md)
- [UserPermissionQuery](interfaces/UserPermissionQuery.md)
- [WebRtcPortRange](interfaces/WebRtcPortRange.md)

## Type Aliases

### BrandedString

Ƭ **BrandedString**<`T`\>: `string` & { `__brand`: `T`  }

#### Type parameters

| Name |
| :------ |
| `T` |

___

### ConnectionInfo

Ƭ **ConnectionInfo**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `allowGzip?` | `boolean` |
| `allowInsecureAuthentication?` | `boolean` |
| `errorPassThrough?` | `boolean` |
| `fetchOptions?` | `Record`<`string`, `string`\> |
| `headers?` | { `[key: string]`: `string` \| `number`;  } |
| `password?` | `string` |
| `skipFetchSetup?` | `boolean` |
| `throttleCallback?` | (`attempt`: `number`, `url`: `string`) => `Promise`<`boolean`\> |
| `throttleLimit?` | `number` |
| `throttleSlotInterval?` | `number` |
| `timeout?` | `number` |
| `url` | `string` |
| `user?` | `string` |

___

### EthereumAddress

Ƭ **EthereumAddress**: [`BrandedString`](modules.md#brandedstring)<``"EthereumAddress"``\>

___

### ExternalProvider

Ƭ **ExternalProvider**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `host?` | `string` |
| `isMetaMask?` | `boolean` |
| `isStatus?` | `boolean` |
| `path?` | `string` |
| `request?` | (`request`: { `method`: `string` ; `params?`: `any`[]  }) => `Promise`<`any`\> |
| `send?` | (`request`: { `method`: `string` ; `params?`: `any`[]  }, `callback`: (`error`: `any`, `response`: `any`) => `void`) => `void` |
| `sendAsync?` | (`request`: { `method`: `string` ; `params?`: `any`[]  }, `callback`: (`error`: `any`, `response`: `any`) => `void`) => `void` |

___

### LogLevel

Ƭ **LogLevel**: ``"silent"`` \| ``"fatal"`` \| ``"error"`` \| ``"warn"`` \| ``"info"`` \| ``"debug"`` \| ``"trace"``

___

### MessageListener

Ƭ **MessageListener**: (`content`: `unknown`, `metadata`: [`MessageMetadata`](modules.md#messagemetadata)) => `unknown` \| `Promise`<`unknown`\>

#### Type declaration

▸ (`content`, `metadata`): `unknown` \| `Promise`<`unknown`\>

##### Parameters

| Name | Type |
| :------ | :------ |
| `content` | `unknown` |
| `metadata` | [`MessageMetadata`](modules.md#messagemetadata) |

##### Returns

`unknown` \| `Promise`<`unknown`\>

___

### MessageMetadata

Ƭ **MessageMetadata**: `Omit`<[`Message`](interfaces/Message.md), ``"content"``\>

___

### MetricsDefinition

Ƭ **MetricsDefinition**: `Record`<`string`, [`Metric`](classes/Metric.md)\>

___

### MetricsReport

Ƭ **MetricsReport**: { `period`: { `end`: `number` ; `start`: `number`  }  } & `Record`<`string`, `any`\>

___

### PermissionAssignment

Ƭ **PermissionAssignment**: [`UserPermissionAssignment`](interfaces/UserPermissionAssignment.md) \| [`PublicPermissionAssignment`](interfaces/PublicPermissionAssignment.md)

___

### PermissionQuery

Ƭ **PermissionQuery**: [`UserPermissionQuery`](interfaces/UserPermissionQuery.md) \| [`PublicPermissionQuery`](interfaces/PublicPermissionQuery.md)

___

### ResendOptions

Ƭ **ResendOptions**: [`ResendLastOptions`](interfaces/ResendLastOptions.md) \| [`ResendFromOptions`](interfaces/ResendFromOptions.md) \| [`ResendRangeOptions`](interfaces/ResendRangeOptions.md)

The supported resend types.

___

### StreamDefinition

Ƭ **StreamDefinition**: `string` \| { `id`: `string` ; `partition?`: `number`  } \| { `partition?`: `number` ; `stream`: `string`  } \| { `partition?`: `number` ; `streamId`: `string`  }

___

### StreamID

Ƭ **StreamID**: [`BrandedString`](modules.md#brandedstring)<``"StreamID"``\>

___

### StreamMessageAESEncrypted

Ƭ **StreamMessageAESEncrypted**<`T`\>: [`StreamMessage`](classes/StreamMessage.md)<`T`\> & { `encryptionType`: [`AES`](enums/EncryptionType.md#aes) ; `groupKeyId`: `string` ; `parsedContent`: `never`  }

Encrypted StreamMessage.

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | `unknown` |

___

### StreamPartID

Ƭ **StreamPartID**: [`BrandedString`](modules.md#brandedstring)<``"StreamPartID"``\>

___

### SubscribeOptions

Ƭ **SubscribeOptions**: [`StreamDefinition`](modules.md#streamdefinition) & [`ExtraSubscribeOptions`](interfaces/ExtraSubscribeOptions.md)

## Variables

### CONFIG\_TEST

• `Const` **CONFIG\_TEST**: [`StreamrClientConfig`](interfaces/StreamrClientConfig.md)

Streamr client constructor options that work in the test environment

___

### STREAMR\_STORAGE\_NODE\_GERMANY

• `Const` **STREAMR\_STORAGE\_NODE\_GERMANY**: ``"0x31546eEA76F2B2b3C5cC06B1c93601dc35c9D916"``

___

### VALID\_FIELD\_TYPES

• `Const` **VALID\_FIELD\_TYPES**: readonly [``"number"``, ``"string"``, ``"boolean"``, ``"list"``, ``"map"``]

## Functions

### formStorageNodeAssignmentStreamId

▸ **formStorageNodeAssignmentStreamId**(`clusterAddress`): [`StreamID`](modules.md#streamid)

#### Parameters

| Name | Type |
| :------ | :------ |
| `clusterAddress` | `string` |

#### Returns

[`StreamID`](modules.md#streamid)
