---
id: "StreamrClient"
title: "Class: StreamrClient"
sidebar_label: "StreamrClient"
sidebar_position: 0
custom_edit_url: null
---

The main API used to interact with Streamr.

## Constructors

### constructor

• **new StreamrClient**(`config?`)

#### Parameters

| Name | Type |
| :------ | :------ |
| `config` | [`StreamrClientConfig`](../interfaces/StreamrClientConfig.md) |

## Properties

### id

• `Readonly` **id**: `string`

___

### generateEthereumAccount

▪ `Static` `Readonly` **generateEthereumAccount**: () => { `address`: `string` ; `privateKey`: `string`  } = `_generateEthereumAccount`

#### Type declaration

▸ (): `Object`

##### Returns

`Object`

| Name | Type |
| :------ | :------ |
| `address` | `string` |
| `privateKey` | `string` |

## Important Methods

### createStream

▸ **createStream**(`propsOrStreamIdOrPath`): `Promise`<[`Stream`](Stream.md)\>

Creates a new stream.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `propsOrStreamIdOrPath` | `string` \| `Partial`<[`StreamMetadata`](../interfaces/StreamMetadata.md)\> & { `id`: `string`  } | the stream id to be used for the new stream, and optionally, any associated metadata |

#### Returns

`Promise`<[`Stream`](Stream.md)\>

___

### getOrCreateStream

▸ **getOrCreateStream**(`props`): `Promise`<[`Stream`](Stream.md)\>

Gets a stream, creating one if it does not exist.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `props` | `Object` | the stream id to get or create. Field `partitions` is only used if creating the stream. |
| `props.id` | `string` | - |
| `props.partitions?` | `number` | - |

#### Returns

`Promise`<[`Stream`](Stream.md)\>

___

### getStream

▸ **getStream**(`streamIdOrPath`): `Promise`<[`Stream`](Stream.md)\>

Gets a stream.

#### Parameters

| Name | Type |
| :------ | :------ |
| `streamIdOrPath` | `string` |

#### Returns

`Promise`<[`Stream`](Stream.md)\>

rejects if the stream is not found

___

### getSubscriptions

▸ **getSubscriptions**(`streamDefinition?`): `Promise`<[`Subscription`](Subscription.md)[]\>

Returns a list of subscriptions matching the given criteria.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `streamDefinition?` | [`StreamDefinition`](../modules.md#streamdefinition) | leave as `undefined` to get all subscriptions |

#### Returns

`Promise`<[`Subscription`](Subscription.md)[]\>

___

### publish

▸ **publish**(`streamDefinition`, `content`, `metadata?`): `Promise`<[`Message`](../interfaces/Message.md)\>

Publishes a message to a stream partition in the network.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `streamDefinition` | [`StreamDefinition`](../modules.md#streamdefinition) | the stream or stream partition to publish the message to |
| `content` | `unknown` | the content (the payload) of the message (must be JSON serializable) |
| `metadata?` | [`PublishMetadata`](../interfaces/PublishMetadata.md) | provide additional metadata to be included in the message or to control the publishing process |

#### Returns

`Promise`<[`Message`](../interfaces/Message.md)\>

the published message (note: the field [content](../interfaces/Message.md#content) is encrypted if the stream is private)

___

### resend

▸ **resend**(`streamDefinition`, `options`, `onMessage?`): `Promise`<[`MessageStream`](MessageStream.md)\>

Performs a resend of stored historical data.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `streamDefinition` | [`StreamDefinition`](../modules.md#streamdefinition) | the stream partition for which data should be resent |
| `options` | [`ResendOptions`](../modules.md#resendoptions) | defines the kind of resend that should be performed |
| `onMessage?` | [`MessageListener`](../modules.md#messagelistener) | callback will be invoked for each message retrieved |

#### Returns

`Promise`<[`MessageStream`](MessageStream.md)\>

a [MessageStream](MessageStream.md) that provides an alternative way of iterating messages. Rejects if the stream is
not stored (i.e. is not assigned to a storage node).

___

### subscribe

▸ **subscribe**(`options`, `onMessage?`): `Promise`<[`Subscription`](Subscription.md)\>

Subscribes to a stream partition in the network.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `options` | `Object` | the stream or stream partition to subscribe to, additionally a resend can be performed by providing resend options |
| `onMessage?` | [`MessageListener`](../modules.md#messagelistener) | callback will be invoked for each message received in subscription |

#### Returns

`Promise`<[`Subscription`](Subscription.md)\>

a [Subscription](Subscription.md) that can be used to manage the subscription etc.

___

### unsubscribe

▸ **unsubscribe**(`streamDefinitionOrSubscription?`): `Promise`<`unknown`\>

Unsubscribes from streams or stream partitions in the network.

**`Remarks`**

no-op if subscription does not exist

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `streamDefinitionOrSubscription?` | [`StreamDefinition`](../modules.md#streamdefinition) \| [`Subscription`](Subscription.md) | leave as `undefined` to unsubscribe from all existing subscriptions. |

#### Returns

`Promise`<`unknown`\>

___

## Other Methods

### addEncryptionKey

▸ **addEncryptionKey**(`key`, `streamIdOrPath`): `Promise`<`void`\>

Adds an encryption key for a given stream to the key store.

**`Remarks`**

Keys will be added to the store automatically by the client as encountered. This method can be used to
manually add some known keys into the store.

#### Parameters

| Name | Type |
| :------ | :------ |
| `key` | [`EncryptionKey`](EncryptionKey.md) |
| `streamIdOrPath` | `string` |

#### Returns

`Promise`<`void`\>

___

### addStreamToStorageNode

▸ **addStreamToStorageNode**(`streamIdOrPath`, `storageNodeAddress`): `Promise`<`void`\>

Assigns a stream to a storage node.

#### Parameters

| Name | Type |
| :------ | :------ |
| `streamIdOrPath` | `string` |
| `storageNodeAddress` | `string` |

#### Returns

`Promise`<`void`\>

___

### closeProxyConnections

▸ **closeProxyConnections**(`streamDefinition`, `nodeIds`, `direction`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `streamDefinition` | [`StreamDefinition`](../modules.md#streamdefinition) |
| `nodeIds` | `string`[] |
| `direction` | [`ProxyDirection`](../enums/ProxyDirection.md) |

#### Returns

`Promise`<`void`\>

___

### connect

▸ **connect**(): `Promise`<`void`\>

Used to manually initialize the network stack and connect to the network.

**`Remarks`**

Connecting is handled automatically by the client. Generally this method need not be called by the user.

#### Returns

`Promise`<`void`\>

___

### deleteStream

▸ **deleteStream**(`streamIdOrPath`): `Promise`<`void`\>

Deletes a stream.

#### Parameters

| Name | Type |
| :------ | :------ |
| `streamIdOrPath` | `string` |

#### Returns

`Promise`<`void`\>

___

### destroy

▸ **destroy**(): `Promise`<`void`\>

Destroys an instance of a [StreamrClient](StreamrClient.md) by disconnecting from peers, clearing any pending tasks, and
freeing up resources. This should be called once a user is done with the instance.

**`Remarks`**

As the name implies, the client instance (or any streams or subscriptions returned by it) should _not_
be used after calling this method.

#### Returns

`Promise`<`void`\>

___

### getAddress

▸ **getAddress**(): `Promise`<[`EthereumAddress`](../modules.md#ethereumaddress)\>

Gets the Ethereum address of the wallet associated with the current [StreamrClient](StreamrClient.md) instance.

#### Returns

`Promise`<[`EthereumAddress`](../modules.md#ethereumaddress)\>

___

### getNode

▸ **getNode**(): `Promise`<[`NetworkNodeStub`](../interfaces/NetworkNodeStub.md)\>

**`Deprecated`**

This in an internal method

#### Returns

`Promise`<[`NetworkNodeStub`](../interfaces/NetworkNodeStub.md)\>

___

### getPermissions

▸ **getPermissions**(`streamIdOrPath`): `Promise`<[`PermissionAssignment`](../modules.md#permissionassignment)[]\>

Returns the list of all permissions in effect for a given stream.

#### Parameters

| Name | Type |
| :------ | :------ |
| `streamIdOrPath` | `string` |

#### Returns

`Promise`<[`PermissionAssignment`](../modules.md#permissionassignment)[]\>

___

### getStorageNodeMetadata

▸ **getStorageNodeMetadata**(`nodeAddress`): `Promise`<[`StorageNodeMetadata`](../interfaces/StorageNodeMetadata.md)\>

Gets the metadata of a storage node from the storage node registry.

#### Parameters

| Name | Type |
| :------ | :------ |
| `nodeAddress` | `string` |

#### Returns

`Promise`<[`StorageNodeMetadata`](../interfaces/StorageNodeMetadata.md)\>

rejects if the storage node is not found

___

### getStorageNodes

▸ **getStorageNodes**(`streamIdOrPath?`): `Promise`<[`EthereumAddress`](../modules.md#ethereumaddress)[]\>

Gets a list of storage nodes.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `streamIdOrPath?` | `string` | if a stream is given, returns the list of storage nodes the stream has been assigned to; leave as `undefined` to return all storage nodes |

#### Returns

`Promise`<[`EthereumAddress`](../modules.md#ethereumaddress)[]\>

___

### getStoredStreams

▸ **getStoredStreams**(`storageNodeAddress`): `Promise`<{ `blockNumber`: `number` ; `streams`: [`Stream`](Stream.md)[]  }\>

Gets all streams assigned to a storage node.

#### Parameters

| Name | Type |
| :------ | :------ |
| `storageNodeAddress` | `string` |

#### Returns

`Promise`<{ `blockNumber`: `number` ; `streams`: [`Stream`](Stream.md)[]  }\>

a list of [Stream](Stream.md) as well as `blockNumber` of result (i.e. blockchain state)

___

### getStreamPublishers

▸ **getStreamPublishers**(`streamIdOrPath`): `AsyncIterable`<[`EthereumAddress`](../modules.md#ethereumaddress)\>

Gets all ethereum addresses that have [PUBLISH](../enums/StreamPermission.md#publish) permission to the stream.

#### Parameters

| Name | Type |
| :------ | :------ |
| `streamIdOrPath` | `string` |

#### Returns

`AsyncIterable`<[`EthereumAddress`](../modules.md#ethereumaddress)\>

___

### getStreamSubscribers

▸ **getStreamSubscribers**(`streamIdOrPath`): `AsyncIterable`<[`EthereumAddress`](../modules.md#ethereumaddress)\>

Gets all ethereum addresses that have [SUBSCRIBE](../enums/StreamPermission.md#subscribe) permission to the stream.

#### Parameters

| Name | Type |
| :------ | :------ |
| `streamIdOrPath` | `string` |

#### Returns

`AsyncIterable`<[`EthereumAddress`](../modules.md#ethereumaddress)\>

___

### grantPermissions

▸ **grantPermissions**(`streamIdOrPath`, `...assignments`): `Promise`<`void`\>

Grants permissions on a given stream.

#### Parameters

| Name | Type |
| :------ | :------ |
| `streamIdOrPath` | `string` |
| `...assignments` | [`PermissionAssignment`](../modules.md#permissionassignment)[] |

#### Returns

`Promise`<`void`\>

___

### hasPermission

▸ **hasPermission**(`query`): `Promise`<`boolean`\>

Checks whether the given permission is in effect.

#### Parameters

| Name | Type |
| :------ | :------ |
| `query` | [`PermissionQuery`](../modules.md#permissionquery) |

#### Returns

`Promise`<`boolean`\>

___

### isStoredStream

▸ **isStoredStream**(`streamIdOrPath`, `storageNodeAddress`): `Promise`<`boolean`\>

Checks whether a stream is assigned to a storage node.

#### Parameters

| Name | Type |
| :------ | :------ |
| `streamIdOrPath` | `string` |
| `storageNodeAddress` | `string` |

#### Returns

`Promise`<`boolean`\>

___

### isStreamPublisher

▸ **isStreamPublisher**(`streamIdOrPath`, `userAddress`): `Promise`<`boolean`\>

Checks whether a given ethereum address has [PUBLISH](../enums/StreamPermission.md#publish) permission to a stream.

#### Parameters

| Name | Type |
| :------ | :------ |
| `streamIdOrPath` | `string` |
| `userAddress` | `string` |

#### Returns

`Promise`<`boolean`\>

___

### isStreamSubscriber

▸ **isStreamSubscriber**(`streamIdOrPath`, `userAddress`): `Promise`<`boolean`\>

Checks whether a given ethereum address has [SUBSCRIBE](../enums/StreamPermission.md#subscribe) permission to a stream.

#### Parameters

| Name | Type |
| :------ | :------ |
| `streamIdOrPath` | `string` |
| `userAddress` | `string` |

#### Returns

`Promise`<`boolean`\>

___

### off

▸ **off**<`T`\>(`eventName`, `listener`): `void`

Removes an event listener from the client.

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | extends keyof [`StreamrClientEvents`](../interfaces/StreamrClientEvents.md) |

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `eventName` | `T` | event name, see [StreamrClientEvents](../interfaces/StreamrClientEvents.md) for options |
| `listener` | [`StreamrClientEvents`](../interfaces/StreamrClientEvents.md)[`T`] | the callback function to remove |

#### Returns

`void`

___

### on

▸ **on**<`T`\>(`eventName`, `listener`): `void`

Adds an event listener to the client.

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | extends keyof [`StreamrClientEvents`](../interfaces/StreamrClientEvents.md) |

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `eventName` | `T` | event name, see [StreamrClientEvents](../interfaces/StreamrClientEvents.md) for options |
| `listener` | [`StreamrClientEvents`](../interfaces/StreamrClientEvents.md)[`T`] | the callback function |

#### Returns

`void`

___

### once

▸ **once**<`T`\>(`eventName`, `listener`): `void`

Adds an event listener to the client that is invoked only once.

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | extends keyof [`StreamrClientEvents`](../interfaces/StreamrClientEvents.md) |

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `eventName` | `T` | event name, see [StreamrClientEvents](../interfaces/StreamrClientEvents.md) for options |
| `listener` | [`StreamrClientEvents`](../interfaces/StreamrClientEvents.md)[`T`] | the callback function |

#### Returns

`void`

___

### openProxyConnections

▸ **openProxyConnections**(`streamDefinition`, `nodeIds`, `direction`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `streamDefinition` | [`StreamDefinition`](../modules.md#streamdefinition) |
| `nodeIds` | `string`[] |
| `direction` | [`ProxyDirection`](../enums/ProxyDirection.md) |

#### Returns

`Promise`<`void`\>

___

### removeStreamFromStorageNode

▸ **removeStreamFromStorageNode**(`streamIdOrPath`, `storageNodeAddress`): `Promise`<`void`\>

Unassigns a stream from a storage node.

#### Parameters

| Name | Type |
| :------ | :------ |
| `streamIdOrPath` | `string` |
| `storageNodeAddress` | `string` |

#### Returns

`Promise`<`void`\>

___

### revokePermissions

▸ **revokePermissions**(`streamIdOrPath`, `...assignments`): `Promise`<`void`\>

Revokes permissions on a given stream.

#### Parameters

| Name | Type |
| :------ | :------ |
| `streamIdOrPath` | `string` |
| `...assignments` | [`PermissionAssignment`](../modules.md#permissionassignment)[] |

#### Returns

`Promise`<`void`\>

___

### searchStreams

▸ **searchStreams**(`term`, `permissionFilter`): `AsyncIterable`<[`Stream`](Stream.md)\>

Searches for streams based on given criteria.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `term` | `undefined` \| `string` | a search term that should be part of the stream id of a result |
| `permissionFilter` | `undefined` \| [`SearchStreamsPermissionFilter`](../interfaces/SearchStreamsPermissionFilter.md) | permissions that should be in effect for a result |

#### Returns

`AsyncIterable`<[`Stream`](Stream.md)\>

___

### setPermissions

▸ **setPermissions**(`...items`): `Promise`<`void`\>

Sets a list of permissions to be in effect.

**`Remarks`**

Can be used to set the permissions of multiple streams in one transaction. Great for doing bulk
operations and saving gas costs. Notice that the behaviour is overwriting, therefore any existing permissions not
defined will be removed (per stream).

#### Parameters

| Name | Type |
| :------ | :------ |
| `...items` | { `assignments`: [`PermissionAssignment`](../modules.md#permissionassignment)[] ; `streamId`: `string`  }[] |

#### Returns

`Promise`<`void`\>

___

### setStorageNodeMetadata

▸ **setStorageNodeMetadata**(`metadata`): `Promise`<`void`\>

Sets the metadata of a storage node in the storage node registry.

**`Remarks`**

Acts on behalf of the wallet associated with the current [StreamrClient](StreamrClient.md) instance.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `metadata` | `undefined` \| [`StorageNodeMetadata`](../interfaces/StorageNodeMetadata.md) | if `undefined`, removes the storage node from the registry |

#### Returns

`Promise`<`void`\>

___

### updateEncryptionKey

▸ **updateEncryptionKey**(`opts`): `Promise`<`void`\>

Manually updates the encryption key used when publishing messages to a given stream.

#### Parameters

| Name | Type |
| :------ | :------ |
| `opts` | [`UpdateEncryptionKeyOptions`](../interfaces/UpdateEncryptionKeyOptions.md) |

#### Returns

`Promise`<`void`\>

___

### updateStream

▸ **updateStream**(`props`): `Promise`<[`Stream`](Stream.md)\>

Updates the metadata of a stream.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `props` | `Partial`<[`StreamMetadata`](../interfaces/StreamMetadata.md)\> & { `id`: `string`  } | the stream id and the metadata fields to be updated |

#### Returns

`Promise`<[`Stream`](Stream.md)\>

___

### waitForStorage

▸ **waitForStorage**(`message`, `options?`): `Promise`<`void`\>

Waits for a message to be stored by a storage node.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `message` | [`Message`](../interfaces/Message.md) | the message to be awaited for |
| `options?` | `Object` | additional options for controlling waiting and message matching |
| `options.count?` | `number` | Controls size of internal resend used in polling. |
| `options.interval?` | `number` | Determines how often should storage node be polled. |
| `options.messageMatchFn?` | (`msgTarget`: [`Message`](../interfaces/Message.md), `msgGot`: [`Message`](../interfaces/Message.md)) => `boolean` | Used to set a custom message equality operator. **`Deprecated`** |
| `options.timeout?` | `number` | Timeout after which to give up if message was not seen. |

#### Returns

`Promise`<`void`\>

rejects if message was found in storage before timeout
