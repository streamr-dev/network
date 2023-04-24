---
id: "BigNumber"
title: "Class: BigNumber"
sidebar_label: "BigNumber"
sidebar_position: 0
custom_edit_url: null
---

## Implements

- `Hexable`

## Constructors

### constructor

• **new BigNumber**(`constructorGuard`, `hex`)

#### Parameters

| Name | Type |
| :------ | :------ |
| `constructorGuard` | `any` |
| `hex` | `string` |

## Properties

### \_hex

• `Readonly` **\_hex**: `string`

___

### \_isBigNumber

• `Readonly` **\_isBigNumber**: `boolean`

## Methods

### abs

▸ **abs**(): [`BigNumber`](BigNumber.md)

#### Returns

[`BigNumber`](BigNumber.md)

___

### add

▸ **add**(`other`): [`BigNumber`](BigNumber.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `other` | `BigNumberish` |

#### Returns

[`BigNumber`](BigNumber.md)

___

### and

▸ **and**(`other`): [`BigNumber`](BigNumber.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `other` | `BigNumberish` |

#### Returns

[`BigNumber`](BigNumber.md)

___

### div

▸ **div**(`other`): [`BigNumber`](BigNumber.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `other` | `BigNumberish` |

#### Returns

[`BigNumber`](BigNumber.md)

___

### eq

▸ **eq**(`other`): `boolean`

#### Parameters

| Name | Type |
| :------ | :------ |
| `other` | `BigNumberish` |

#### Returns

`boolean`

___

### fromTwos

▸ **fromTwos**(`value`): [`BigNumber`](BigNumber.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `value` | `number` |

#### Returns

[`BigNumber`](BigNumber.md)

___

### gt

▸ **gt**(`other`): `boolean`

#### Parameters

| Name | Type |
| :------ | :------ |
| `other` | `BigNumberish` |

#### Returns

`boolean`

___

### gte

▸ **gte**(`other`): `boolean`

#### Parameters

| Name | Type |
| :------ | :------ |
| `other` | `BigNumberish` |

#### Returns

`boolean`

___

### isNegative

▸ **isNegative**(): `boolean`

#### Returns

`boolean`

___

### isZero

▸ **isZero**(): `boolean`

#### Returns

`boolean`

___

### lt

▸ **lt**(`other`): `boolean`

#### Parameters

| Name | Type |
| :------ | :------ |
| `other` | `BigNumberish` |

#### Returns

`boolean`

___

### lte

▸ **lte**(`other`): `boolean`

#### Parameters

| Name | Type |
| :------ | :------ |
| `other` | `BigNumberish` |

#### Returns

`boolean`

___

### mask

▸ **mask**(`value`): [`BigNumber`](BigNumber.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `value` | `number` |

#### Returns

[`BigNumber`](BigNumber.md)

___

### mod

▸ **mod**(`other`): [`BigNumber`](BigNumber.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `other` | `BigNumberish` |

#### Returns

[`BigNumber`](BigNumber.md)

___

### mul

▸ **mul**(`other`): [`BigNumber`](BigNumber.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `other` | `BigNumberish` |

#### Returns

[`BigNumber`](BigNumber.md)

___

### or

▸ **or**(`other`): [`BigNumber`](BigNumber.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `other` | `BigNumberish` |

#### Returns

[`BigNumber`](BigNumber.md)

___

### pow

▸ **pow**(`other`): [`BigNumber`](BigNumber.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `other` | `BigNumberish` |

#### Returns

[`BigNumber`](BigNumber.md)

___

### shl

▸ **shl**(`value`): [`BigNumber`](BigNumber.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `value` | `number` |

#### Returns

[`BigNumber`](BigNumber.md)

___

### shr

▸ **shr**(`value`): [`BigNumber`](BigNumber.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `value` | `number` |

#### Returns

[`BigNumber`](BigNumber.md)

___

### sub

▸ **sub**(`other`): [`BigNumber`](BigNumber.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `other` | `BigNumberish` |

#### Returns

[`BigNumber`](BigNumber.md)

___

### toBigInt

▸ **toBigInt**(): `bigint`

#### Returns

`bigint`

___

### toHexString

▸ **toHexString**(): `string`

#### Returns

`string`

#### Implementation of

Hexable.toHexString

___

### toJSON

▸ **toJSON**(`key?`): `any`

#### Parameters

| Name | Type |
| :------ | :------ |
| `key?` | `string` |

#### Returns

`any`

___

### toNumber

▸ **toNumber**(): `number`

#### Returns

`number`

___

### toString

▸ **toString**(): `string`

#### Returns

`string`

___

### toTwos

▸ **toTwos**(`value`): [`BigNumber`](BigNumber.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `value` | `number` |

#### Returns

[`BigNumber`](BigNumber.md)

___

### xor

▸ **xor**(`other`): [`BigNumber`](BigNumber.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `other` | `BigNumberish` |

#### Returns

[`BigNumber`](BigNumber.md)

___

### from

▸ `Static` **from**(`value`): [`BigNumber`](BigNumber.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `value` | `any` |

#### Returns

[`BigNumber`](BigNumber.md)

___

### isBigNumber

▸ `Static` **isBigNumber**(`value`): value is BigNumber

#### Parameters

| Name | Type |
| :------ | :------ |
| `value` | `any` |

#### Returns

value is BigNumber
