# Class: Subscription

A convenience API for managing an individual subscription.

## Extends

- [`MessageStream`](MessageStream.md)

## Properties

### erc1271ContractAddress

> `readonly` **erc1271ContractAddress**: `undefined` \| [`EthereumAddress`](../api.md#ethereumaddress)

***

### streamPartId

> `readonly` **streamPartId**: [`StreamPartID`](../api.md#streampartid)

## Methods

### \[asyncIterator\]()

> **\[asyncIterator\]**(): `AsyncIterator`\<[`Message`](../interfaces/Message.md), `any`, `any`\>

#### Returns

`AsyncIterator`\<[`Message`](../interfaces/Message.md), `any`, `any`\>

#### Inherited from

[`MessageStream`](MessageStream.md).[`[asyncIterator]`](MessageStream.md#%5Basynciterator%5D)

***

### off()

> **off**\<`E`\>(`eventName`, `listener`): `void`

Removes an event listener from the subscription.

#### Type Parameters

• **E** *extends* keyof [`SubscriptionEvents`](../interfaces/SubscriptionEvents.md)

#### Parameters

• **eventName**: `E`

event name, see [SubscriptionEvents](../interfaces/SubscriptionEvents.md) for options

• **listener**: [`SubscriptionEvents`](../interfaces/SubscriptionEvents.md)\[`E`\]

the callback function to remove

#### Returns

`void`

***

### on()

> **on**\<`E`\>(`eventName`, `listener`): `void`

Adds an event listener to the subscription.

#### Type Parameters

• **E** *extends* keyof [`SubscriptionEvents`](../interfaces/SubscriptionEvents.md)

#### Parameters

• **eventName**: `E`

event name, see [SubscriptionEvents](../interfaces/SubscriptionEvents.md) for options

• **listener**: [`SubscriptionEvents`](../interfaces/SubscriptionEvents.md)\[`E`\]

the callback function

#### Returns

`void`

***

### once()

> **once**\<`E`\>(`eventName`, `listener`): `void`

Adds an event listener to the subscription that is invoked only once.

#### Type Parameters

• **E** *extends* keyof [`SubscriptionEvents`](../interfaces/SubscriptionEvents.md)

#### Parameters

• **eventName**: `E`

event name, see [SubscriptionEvents](../interfaces/SubscriptionEvents.md) for options

• **listener**: [`SubscriptionEvents`](../interfaces/SubscriptionEvents.md)\[`E`\]

the callback function

#### Returns

`void`

***

### unsubscribe()

> **unsubscribe**(): `Promise`\<`void`\>

Unsubscribes this subscription.

#### Returns

`Promise`\<`void`\>

#### Remarks

The instance should not be used after calling this.
