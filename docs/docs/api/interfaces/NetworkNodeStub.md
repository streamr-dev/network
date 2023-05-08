---
id: "NetworkNodeStub"
title: "Interface: NetworkNodeStub"
sidebar_label: "NetworkNodeStub"
sidebar_position: 0
custom_edit_url: null
---

**`Deprecated`**

This in an internal interface

## Properties

### addMessageListener

• **addMessageListener**: (`listener`: (`msg`: [`StreamMessage`](../classes/StreamMessage.md)<`unknown`\>) => `void`) => `void`

#### Type declaration

▸ (`listener`): `void`

##### Parameters

| Name | Type |
| :------ | :------ |
| `listener` | (`msg`: [`StreamMessage`](../classes/StreamMessage.md)<`unknown`\>) => `void` |

##### Returns

`void`

___

### getDiagnosticInfo

• **getDiagnosticInfo**: () => `Record`<`string`, `unknown`\>

#### Type declaration

▸ (): `Record`<`string`, `unknown`\>

##### Returns

`Record`<`string`, `unknown`\>

___

### getMetricsContext

• **getMetricsContext**: () => [`MetricsContext`](../classes/MetricsContext.md)

#### Type declaration

▸ (): [`MetricsContext`](../classes/MetricsContext.md)

##### Returns

[`MetricsContext`](../classes/MetricsContext.md)

___

### getNeighbors

• **getNeighbors**: () => readonly `string`[]

#### Type declaration

▸ (): readonly `string`[]

##### Returns

readonly `string`[]

___

### getNeighborsForStreamPart

• **getNeighborsForStreamPart**: (`streamPartId`: [`StreamPartID`](../modules.md#streampartid)) => readonly `string`[]

#### Type declaration

▸ (`streamPartId`): readonly `string`[]

##### Parameters

| Name | Type |
| :------ | :------ |
| `streamPartId` | [`StreamPartID`](../modules.md#streampartid) |

##### Returns

readonly `string`[]

___

### getNodeId

• **getNodeId**: () => `string`

#### Type declaration

▸ (): `string`

##### Returns

`string`

___

### getRtt

• **getRtt**: (`nodeId`: `string`) => `undefined` \| `number`

#### Type declaration

▸ (`nodeId`): `undefined` \| `number`

##### Parameters

| Name | Type |
| :------ | :------ |
| `nodeId` | `string` |

##### Returns

`undefined` \| `number`

___

### getStreamParts

• **getStreamParts**: () => `Iterable`<[`StreamPartID`](../modules.md#streampartid)\>

#### Type declaration

▸ (): `Iterable`<[`StreamPartID`](../modules.md#streampartid)\>

##### Returns

`Iterable`<[`StreamPartID`](../modules.md#streampartid)\>

___

### hasStreamPart

• **hasStreamPart**: (`streamPartId`: [`StreamPartID`](../modules.md#streampartid)) => `boolean`

#### Type declaration

▸ (`streamPartId`): `boolean`

##### Parameters

| Name | Type |
| :------ | :------ |
| `streamPartId` | [`StreamPartID`](../modules.md#streampartid) |

##### Returns

`boolean`

___

### publish

• **publish**: (`streamMessage`: [`StreamMessage`](../classes/StreamMessage.md)<`unknown`\>) => `void`

#### Type declaration

▸ (`streamMessage`): `void`

##### Parameters

| Name | Type |
| :------ | :------ |
| `streamMessage` | [`StreamMessage`](../classes/StreamMessage.md)<`unknown`\> |

##### Returns

`void`

___

### removeMessageListener

• **removeMessageListener**: (`listener`: (`msg`: [`StreamMessage`](../classes/StreamMessage.md)<`unknown`\>) => `void`) => `void`

#### Type declaration

▸ (`listener`): `void`

##### Parameters

| Name | Type |
| :------ | :------ |
| `listener` | (`msg`: [`StreamMessage`](../classes/StreamMessage.md)<`unknown`\>) => `void` |

##### Returns

`void`

___

### setExtraMetadata

• **setExtraMetadata**: (`metadata`: `Record`<`string`, `unknown`\>) => `void`

#### Type declaration

▸ (`metadata`): `void`

##### Parameters

| Name | Type |
| :------ | :------ |
| `metadata` | `Record`<`string`, `unknown`\> |

##### Returns

`void`

___

### subscribe

• **subscribe**: (`streamPartId`: [`StreamPartID`](../modules.md#streampartid)) => `void`

#### Type declaration

▸ (`streamPartId`): `void`

##### Parameters

| Name | Type |
| :------ | :------ |
| `streamPartId` | [`StreamPartID`](../modules.md#streampartid) |

##### Returns

`void`

___

### subscribeAndWaitForJoin

• **subscribeAndWaitForJoin**: (`streamPart`: [`StreamPartID`](../modules.md#streampartid), `timeout?`: `number`) => `Promise`<`number`\>

#### Type declaration

▸ (`streamPart`, `timeout?`): `Promise`<`number`\>

##### Parameters

| Name | Type |
| :------ | :------ |
| `streamPart` | [`StreamPartID`](../modules.md#streampartid) |
| `timeout?` | `number` |

##### Returns

`Promise`<`number`\>

___

### unsubscribe

• **unsubscribe**: (`streamPartId`: [`StreamPartID`](../modules.md#streampartid)) => `void`

#### Type declaration

▸ (`streamPartId`): `void`

##### Parameters

| Name | Type |
| :------ | :------ |
| `streamPartId` | [`StreamPartID`](../modules.md#streampartid) |

##### Returns

`void`

___

### waitForJoinAndPublish

• **waitForJoinAndPublish**: (`msg`: [`StreamMessage`](../classes/StreamMessage.md)<`unknown`\>, `timeout?`: `number`) => `Promise`<`number`\>

#### Type declaration

▸ (`msg`, `timeout?`): `Promise`<`number`\>

##### Parameters

| Name | Type |
| :------ | :------ |
| `msg` | [`StreamMessage`](../classes/StreamMessage.md)<`unknown`\> |
| `timeout?` | `number` |

##### Returns

`Promise`<`number`\>
