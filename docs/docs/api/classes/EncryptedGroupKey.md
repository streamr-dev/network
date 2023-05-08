---
id: "EncryptedGroupKey"
title: "Class: EncryptedGroupKey"
sidebar_label: "EncryptedGroupKey"
sidebar_position: 0
custom_edit_url: null
---

## Constructors

### constructor

• **new EncryptedGroupKey**(`groupKeyId`, `encryptedGroupKeyHex`, `serialized?`)

A pair (groupKeyId, encryptedGroupKey) where the encryptedGroupKey is an encrypted, hex-encoded version of the group key.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `groupKeyId` | `string` |  |
| `encryptedGroupKeyHex` | `string` |  |
| `serialized?` | ``null`` \| `string` | Optional. If given, this exact string is returned from serialize(). |

## Properties

### encryptedGroupKeyHex

• **encryptedGroupKeyHex**: `string`

___

### groupKeyId

• **groupKeyId**: `string`

___

### serialized

• **serialized**: ``null`` \| `string`

## Methods

### serialize

▸ **serialize**(): `string`

#### Returns

`string`

___

### toArray

▸ **toArray**(): `EncryptedGroupKeySerialized`

#### Returns

`EncryptedGroupKeySerialized`

___

### deserialize

▸ `Static` **deserialize**(`json`): [`EncryptedGroupKey`](EncryptedGroupKey.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `json` | `string` |

#### Returns

[`EncryptedGroupKey`](EncryptedGroupKey.md)

___

### fromArray

▸ `Static` **fromArray**(`arr`): [`EncryptedGroupKey`](EncryptedGroupKey.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `arr` | `EncryptedGroupKeySerialized` |

#### Returns

[`EncryptedGroupKey`](EncryptedGroupKey.md)
