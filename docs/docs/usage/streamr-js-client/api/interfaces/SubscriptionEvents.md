---
id: "SubscriptionEvents"
title: "Interface: SubscriptionEvents"
sidebar_label: "SubscriptionEvents"
sidebar_position: 0
custom_edit_url: null
---

Events emitted by [Subscription](../classes/Subscription.md).

## Properties

### error

• **error**: (`err`: `Error`) => `void`

#### Type declaration

▸ (`err`): `void`

Emitted if an error occurred in the subscription.

##### Parameters

| Name | Type |
| :------ | :------ |
| `err` | `Error` |

##### Returns

`void`

___

### resendComplete

• **resendComplete**: () => `void`

#### Type declaration

▸ (): `void`

Emitted when a resend is complete.

##### Returns

`void`
