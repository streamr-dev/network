# Class: StreamMessage

## Implements

- [`StreamMessageOptions`](../interfaces/StreamMessageOptions.md)

## Constructors

### new StreamMessage()

> **new StreamMessage**(`__namedParameters`): [`StreamMessage`](StreamMessage.md)

#### Parameters

• **\_\_namedParameters**: [`StreamMessageOptions`](../interfaces/StreamMessageOptions.md)

#### Returns

[`StreamMessage`](StreamMessage.md)

## Properties

### content

> `readonly` **content**: `Uint8Array`

#### Implementation of

[`StreamMessageOptions`](../interfaces/StreamMessageOptions.md).[`content`](../interfaces/StreamMessageOptions.md#content)

***

### contentType

> `readonly` **contentType**: [`ContentType`](../enumerations/ContentType.md)

#### Implementation of

[`StreamMessageOptions`](../interfaces/StreamMessageOptions.md).[`contentType`](../interfaces/StreamMessageOptions.md#contenttype)

***

### encryptionType

> `readonly` **encryptionType**: [`EncryptionType`](../enumerations/EncryptionType.md)

#### Implementation of

[`StreamMessageOptions`](../interfaces/StreamMessageOptions.md).[`encryptionType`](../interfaces/StreamMessageOptions.md#encryptiontype)

***

### groupKeyId?

> `readonly` `optional` **groupKeyId**: `string`

#### Implementation of

[`StreamMessageOptions`](../interfaces/StreamMessageOptions.md).[`groupKeyId`](../interfaces/StreamMessageOptions.md#groupkeyid)

***

### messageId

> `readonly` **messageId**: [`MessageID`](MessageID.md)

#### Implementation of

[`StreamMessageOptions`](../interfaces/StreamMessageOptions.md).[`messageId`](../interfaces/StreamMessageOptions.md#messageid)

***

### messageType

> `readonly` **messageType**: [`StreamMessageType`](../enumerations/StreamMessageType.md)

#### Implementation of

[`StreamMessageOptions`](../interfaces/StreamMessageOptions.md).[`messageType`](../interfaces/StreamMessageOptions.md#messagetype)

***

### newGroupKey?

> `readonly` `optional` **newGroupKey**: [`EncryptedGroupKey`](EncryptedGroupKey.md)

#### Implementation of

[`StreamMessageOptions`](../interfaces/StreamMessageOptions.md).[`newGroupKey`](../interfaces/StreamMessageOptions.md#newgroupkey)

***

### prevMsgRef?

> `readonly` `optional` **prevMsgRef**: [`MessageRef`](MessageRef.md)

#### Implementation of

[`StreamMessageOptions`](../interfaces/StreamMessageOptions.md).[`prevMsgRef`](../interfaces/StreamMessageOptions.md#prevmsgref)

***

### signature

> `readonly` **signature**: `Uint8Array`

#### Implementation of

[`StreamMessageOptions`](../interfaces/StreamMessageOptions.md).[`signature`](../interfaces/StreamMessageOptions.md#signature)

***

### signatureType

> `readonly` **signatureType**: [`SignatureType`](../enumerations/SignatureType.md)

#### Implementation of

[`StreamMessageOptions`](../interfaces/StreamMessageOptions.md).[`signatureType`](../interfaces/StreamMessageOptions.md#signaturetype)

## Methods

### getMessageRef()

> **getMessageRef**(): [`MessageRef`](MessageRef.md)

#### Returns

[`MessageRef`](MessageRef.md)

***

### getMsgChainId()

> **getMsgChainId**(): `string`

#### Returns

`string`

***

### getParsedContent()

> **getParsedContent**(): `Record`\<`string`, `unknown`\> \| `unknown`[] \| `Uint8Array`

#### Returns

`Record`\<`string`, `unknown`\> \| `unknown`[] \| `Uint8Array`

***

### getPublisherId()

> **getPublisherId**(): [`UserID`](../api.md#userid)

#### Returns

[`UserID`](../api.md#userid)

***

### getSequenceNumber()

> **getSequenceNumber**(): `number`

#### Returns

`number`

***

### getStreamId()

> **getStreamId**(): [`StreamID`](../api.md#streamid)

#### Returns

[`StreamID`](../api.md#streamid)

***

### getStreamPartID()

> **getStreamPartID**(): [`StreamPartID`](../api.md#streampartid)

#### Returns

[`StreamPartID`](../api.md#streampartid)

***

### getStreamPartition()

> **getStreamPartition**(): `number`

#### Returns

`number`

***

### getTimestamp()

> **getTimestamp**(): `number`

#### Returns

`number`

***

### isAESEncrypted()

> `static` **isAESEncrypted**(`msg`): `msg is StreamMessageAESEncrypted`

#### Parameters

• **msg**: [`StreamMessage`](StreamMessage.md)

#### Returns

`msg is StreamMessageAESEncrypted`
