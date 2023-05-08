---
id: "StreamMessage"
title: "Class: StreamMessage<T>"
sidebar_label: "StreamMessage"
sidebar_position: 0
custom_edit_url: null
---

## Type parameters

| Name | Type |
| :------ | :------ |
| `T` | `unknown` |

## Constructors

### constructor

• **new StreamMessage**<`T`\>(`«destructured»`)

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | `unknown` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `«destructured»` | [`StreamMessageOptions`](../interfaces/StreamMessageOptions.md)<`T`\> |

## Properties

### contentType

• **contentType**: [`JSON`](../enums/ContentType.md#json)

___

### encryptionType

• **encryptionType**: [`EncryptionType`](../enums/EncryptionType.md)

___

### groupKeyId

• **groupKeyId**: ``null`` \| `string`

___

### messageId

• **messageId**: [`MessageID`](MessageID.md)

___

### messageType

• **messageType**: [`StreamMessageType`](../enums/StreamMessageType.md)

___

### newGroupKey

• **newGroupKey**: ``null`` \| [`EncryptedGroupKey`](EncryptedGroupKey.md)

___

### parsedContent

• `Optional` **parsedContent**: `T`

___

### prevMsgRef

• **prevMsgRef**: ``null`` \| [`MessageRef`](MessageRef.md)

___

### serializedContent

• **serializedContent**: `string`

___

### signature

• **signature**: `string`

___

### LATEST\_VERSION

▪ `Static` **LATEST\_VERSION**: `number`

## Methods

### clone

▸ **clone**(): [`StreamMessage`](StreamMessage.md)<`T`\>

Create a new StreamMessage identical to the passed-in streamMessage.

#### Returns

[`StreamMessage`](StreamMessage.md)<`T`\>

___

### getContent

▸ **getContent**(): `string`

#### Returns

`string`

▸ **getContent**(`parsedContent`): `string`

#### Parameters

| Name | Type |
| :------ | :------ |
| `parsedContent` | ``false`` |

#### Returns

`string`

▸ **getContent**(`parsedContent`): `T`

#### Parameters

| Name | Type |
| :------ | :------ |
| `parsedContent` | ``true`` |

#### Returns

`T`

___

### getMessageID

▸ **getMessageID**(): [`MessageID`](MessageID.md)

#### Returns

[`MessageID`](MessageID.md)

___

### getMessageRef

▸ **getMessageRef**(): [`MessageRef`](MessageRef.md)

#### Returns

[`MessageRef`](MessageRef.md)

___

### getMsgChainId

▸ **getMsgChainId**(): `string`

#### Returns

`string`

___

### getNewGroupKey

▸ **getNewGroupKey**(): ``null`` \| [`EncryptedGroupKey`](EncryptedGroupKey.md)

#### Returns

``null`` \| [`EncryptedGroupKey`](EncryptedGroupKey.md)

___

### getParsedContent

▸ **getParsedContent**(): `T`

Lazily parses the content to JSON

#### Returns

`T`

___

### getPreviousMessageRef

▸ **getPreviousMessageRef**(): ``null`` \| [`MessageRef`](MessageRef.md)

#### Returns

``null`` \| [`MessageRef`](MessageRef.md)

___

### getPublisherId

▸ **getPublisherId**(): [`EthereumAddress`](../modules.md#ethereumaddress)

#### Returns

[`EthereumAddress`](../modules.md#ethereumaddress)

___

### getSequenceNumber

▸ **getSequenceNumber**(): `number`

#### Returns

`number`

___

### getSerializedContent

▸ **getSerializedContent**(): `string`

#### Returns

`string`

___

### getStreamId

▸ **getStreamId**(): [`StreamID`](../modules.md#streamid)

#### Returns

[`StreamID`](../modules.md#streamid)

___

### getStreamPartID

▸ **getStreamPartID**(): [`StreamPartID`](../modules.md#streampartid)

#### Returns

[`StreamPartID`](../modules.md#streampartid)

___

### getStreamPartition

▸ **getStreamPartition**(): `number`

#### Returns

`number`

___

### getTimestamp

▸ **getTimestamp**(): `number`

#### Returns

`number`

___

### serialize

▸ **serialize**(`version?`): `string`

#### Parameters

| Name | Type |
| :------ | :------ |
| `version?` | `number` |

#### Returns

`string`

___

### deserialize

▸ `Static` **deserialize**(`msg`): [`StreamMessage`](StreamMessage.md)<`unknown`\>

Takes a serialized representation (array or string) of a message, and returns a StreamMessage instance.

#### Parameters

| Name | Type |
| :------ | :------ |
| `msg` | `string` \| `any`[] |

#### Returns

[`StreamMessage`](StreamMessage.md)<`unknown`\>

___

### getSupportedVersions

▸ `Static` **getSupportedVersions**(): `number`[]

#### Returns

`number`[]

___

### isAESEncrypted

▸ `Static` **isAESEncrypted**<`T`\>(`msg`): msg is StreamMessageAESEncrypted<T\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | `unknown` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `msg` | [`StreamMessage`](StreamMessage.md)<`T`\> |

#### Returns

msg is StreamMessageAESEncrypted<T\>

___

### validateContentType

▸ `Static` **validateContentType**(`contentType`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `contentType` | [`JSON`](../enums/ContentType.md#json) |

#### Returns

`void`

___

### validateEncryptionType

▸ `Static` **validateEncryptionType**(`encryptionType`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `encryptionType` | [`EncryptionType`](../enums/EncryptionType.md) |

#### Returns

`void`

___

### validateMessageType

▸ `Static` **validateMessageType**(`messageType`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `messageType` | [`StreamMessageType`](../enums/StreamMessageType.md) |

#### Returns

`void`

___

### validateSequence

▸ `Static` **validateSequence**(`«destructured»`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `«destructured»` | `Object` |
| › `messageId` | [`MessageID`](MessageID.md) |
| › `prevMsgRef?` | ``null`` \| [`MessageRef`](MessageRef.md) |

#### Returns

`void`

___

### versionSupportsEncryption

▸ `Static` **versionSupportsEncryption**(`streamMessageVersion`): `boolean`

#### Parameters

| Name | Type |
| :------ | :------ |
| `streamMessageVersion` | `number` |

#### Returns

`boolean`
