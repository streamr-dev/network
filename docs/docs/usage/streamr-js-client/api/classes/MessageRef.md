---
id: "MessageRef"
title: "Class: MessageRef"
sidebar_label: "MessageRef"
sidebar_position: 0
custom_edit_url: null
---

## Constructors

### constructor

• **new MessageRef**(`timestamp`, `sequenceNumber`)

#### Parameters

| Name | Type |
| :------ | :------ |
| `timestamp` | `number` |
| `sequenceNumber` | `number` |

## Properties

### sequenceNumber

• **sequenceNumber**: `number`

___

### timestamp

• **timestamp**: `number`

## Methods

### clone

▸ **clone**(): [`MessageRef`](MessageRef.md)

#### Returns

[`MessageRef`](MessageRef.md)

___

### compareTo

▸ **compareTo**(`other`): `number`

#### Parameters

| Name | Type |
| :------ | :------ |
| `other` | [`MessageRef`](MessageRef.md) |

#### Returns

`number`

___

### serialize

▸ **serialize**(): `string`

#### Returns

`string`

___

### toArray

▸ **toArray**(): `any`[]

#### Returns

`any`[]

___

### fromArray

▸ `Static` **fromArray**(`arr`): [`MessageRef`](MessageRef.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `arr` | `any`[] |

#### Returns

[`MessageRef`](MessageRef.md)
