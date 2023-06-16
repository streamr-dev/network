---
id: "Subscription"
title: "Class: Subscription"
sidebar_label: "Subscription"
sidebar_position: 0
custom_edit_url: null
---

A convenience API for managing an individual subscription.

## Hierarchy

- [`MessageStream`](MessageStream.md)

  ↳ **`Subscription`**

## Properties

### streamPartId

• `Readonly` **streamPartId**: [`StreamPartID`](../index.md#streampartid)

## Methods

### [asyncIterator]

▸ **[asyncIterator]**(): `AsyncIterator`<[`Message`](../interfaces/Message.md), `any`, `undefined`\>

#### Returns

`AsyncIterator`<[`Message`](../interfaces/Message.md), `any`, `undefined`\>

#### Inherited from

[MessageStream](MessageStream.md).[[asyncIterator]](MessageStream.md#[asynciterator])

___

### off

▸ **off**<`E`\>(`eventName`, `listener`): `void`

Removes an event listener from the subscription.

#### Type parameters

| Name | Type |
| :------ | :------ |
| `E` | extends keyof [`SubscriptionEvents`](../interfaces/SubscriptionEvents.md) |

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `eventName` | `E` | event name, see [SubscriptionEvents](../interfaces/SubscriptionEvents.md) for options |
| `listener` | [`SubscriptionEvents`](../interfaces/SubscriptionEvents.md)[`E`] | the callback function to remove |

#### Returns

`void`

___

### on

▸ **on**<`E`\>(`eventName`, `listener`): `void`

Adds an event listener to the subscription.

#### Type parameters

| Name | Type |
| :------ | :------ |
| `E` | extends keyof [`SubscriptionEvents`](../interfaces/SubscriptionEvents.md) |

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `eventName` | `E` | event name, see [SubscriptionEvents](../interfaces/SubscriptionEvents.md) for options |
| `listener` | [`SubscriptionEvents`](../interfaces/SubscriptionEvents.md)[`E`] | the callback function |

#### Returns

`void`

___

### once

▸ **once**<`E`\>(`eventName`, `listener`): `void`

Adds an event listener to the subscription that is invoked only once.

#### Type parameters

| Name | Type |
| :------ | :------ |
| `E` | extends keyof [`SubscriptionEvents`](../interfaces/SubscriptionEvents.md) |

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `eventName` | `E` | event name, see [SubscriptionEvents](../interfaces/SubscriptionEvents.md) for options |
| `listener` | [`SubscriptionEvents`](../interfaces/SubscriptionEvents.md)[`E`] | the callback function |

#### Returns

`void`

___

### unsubscribe

▸ **unsubscribe**(): `Promise`<`void`\>

Unsubscribes this subscription.

**`Remarks`**

The instance should not be used after calling this.

#### Returns

`Promise`<`void`\>
