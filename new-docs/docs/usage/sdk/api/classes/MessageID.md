# Class: MessageID

## Constructors

### new MessageID()

> **new MessageID**(`streamId`, `streamPartition`, `timestamp`, `sequenceNumber`, `publisherId`, `msgChainId`): [`MessageID`](MessageID.md)

#### Parameters

• **streamId**: [`StreamID`](../api.md#streamid)

• **streamPartition**: `number`

• **timestamp**: `number`

• **sequenceNumber**: `number`

• **publisherId**: [`UserID`](../api.md#userid)

• **msgChainId**: `string`

#### Returns

[`MessageID`](MessageID.md)

## Properties

### msgChainId

> `readonly` **msgChainId**: `string`

***

### publisherId

> `readonly` **publisherId**: [`UserID`](../api.md#userid)

***

### sequenceNumber

> `readonly` **sequenceNumber**: `number`

***

### streamId

> `readonly` **streamId**: [`StreamID`](../api.md#streamid)

***

### streamPartition

> `readonly` **streamPartition**: `number`

***

### timestamp

> `readonly` **timestamp**: `number`

## Methods

### getStreamPartID()

> **getStreamPartID**(): [`StreamPartID`](../api.md#streampartid)

#### Returns

[`StreamPartID`](../api.md#streampartid)

***

### toMessageRef()

> **toMessageRef**(): [`MessageRef`](MessageRef.md)

#### Returns

[`MessageRef`](MessageRef.md)
