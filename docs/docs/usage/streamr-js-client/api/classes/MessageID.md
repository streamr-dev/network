---
id: "MessageID"
title: "Class: MessageID"
sidebar_label: "MessageID"
sidebar_position: 0
custom_edit_url: null
---

## Constructors

### constructor

• **new MessageID**(`streamId`, `streamPartition`, `timestamp`, `sequenceNumber`, `publisherId`, `msgChainId`)

#### Parameters

| Name | Type |
| :------ | :------ |
| `streamId` | [`StreamID`](../index.md#streamid) |
| `streamPartition` | `number` |
| `timestamp` | `number` |
| `sequenceNumber` | `number` |
| `publisherId` | [`EthereumAddress`](../index.md#ethereumaddress) |
| `msgChainId` | `string` |

## Properties

### msgChainId

• **msgChainId**: `string`

___

### publisherId

• **publisherId**: [`EthereumAddress`](../index.md#ethereumaddress)

___

### sequenceNumber

• **sequenceNumber**: `number`

___

### streamId

• **streamId**: [`StreamID`](../index.md#streamid)

___

### streamPartition

• **streamPartition**: `number`

___

### timestamp

• **timestamp**: `number`

## Methods

### clone

▸ **clone**(): [`MessageID`](MessageID.md)

#### Returns

[`MessageID`](MessageID.md)

___

### getStreamPartID

▸ **getStreamPartID**(): [`StreamPartID`](../index.md#streampartid)

#### Returns

[`StreamPartID`](../index.md#streampartid)

___

### serialize

▸ **serialize**(): `string`

#### Returns

`string`

___

### toArray

▸ **toArray**(): `MessageIDArray`

#### Returns

`MessageIDArray`

___

### toMessageRef

▸ **toMessageRef**(): [`MessageRef`](MessageRef.md)

#### Returns

[`MessageRef`](MessageRef.md)

___

### fromArray

▸ `Static` **fromArray**(`arr`): [`MessageID`](MessageID.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `arr` | `MessageIDArray` |

#### Returns

[`MessageID`](MessageID.md)
