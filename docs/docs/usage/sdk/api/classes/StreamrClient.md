# Class: StreamrClient

The main API used to interact with Streamr.

## Constructors

### new StreamrClient()

> **new StreamrClient**(`config`): [`StreamrClient`](StreamrClient.md)

#### Parameters

• **config**: [`StreamrClientConfig`](../interfaces/StreamrClientConfig.md) = `{}`

#### Returns

[`StreamrClient`](StreamrClient.md)

## Properties

### id

> `readonly` **id**: `string`

***

### generateEthereumAccount()

> `readonly` `static` **generateEthereumAccount**: () => `object` = `_generateEthereumAccount`

#### Returns

`object`

##### address

> **address**: `string`

##### privateKey

> **privateKey**: `string`

## Methods

### Important

#### createStream()

> **createStream**(`propsOrStreamIdOrPath`): `Promise`\<[`Stream`](Stream.md)\>

Creates a new stream.

##### Parameters

• **propsOrStreamIdOrPath**: `string` \| [`StreamMetadata`](../api.md#streammetadata) & `object`

the stream id to be used for the new stream, and optionally, any
associated metadata

##### Returns

`Promise`\<[`Stream`](Stream.md)\>

##### Remarks

when creating a stream with an ENS domain, the returned promise can take several minutes to settle

***

#### getOrCreateStream()

> **getOrCreateStream**(`props`): `Promise`\<[`Stream`](Stream.md)\>

Gets a stream, creating one if it does not exist.

##### Parameters

• **props**

the stream id to get or create. Field `partitions` is only used if creating the stream.

• **props.id**: `string`

• **props.partitions?**: `number`

##### Returns

`Promise`\<[`Stream`](Stream.md)\>

##### Remarks

when creating a stream with an ENS domain, the returned promise can take several minutes to settle

***

#### getStream()

> **getStream**(`streamIdOrPath`): `Promise`\<[`Stream`](Stream.md)\>

Gets a stream.

##### Parameters

• **streamIdOrPath**: `string`

##### Returns

`Promise`\<[`Stream`](Stream.md)\>

rejects if the stream is not found

***

#### getSubscriptions()

> **getSubscriptions**(`streamDefinition`?): `Promise`\<[`Subscription`](Subscription.md)[]\>

Returns a list of subscriptions matching the given criteria.

##### Parameters

• **streamDefinition?**: [`StreamDefinition`](../api.md#streamdefinition)

leave as `undefined` to get all subscriptions

##### Returns

`Promise`\<[`Subscription`](Subscription.md)[]\>

***

#### publish()

> **publish**(`streamDefinition`, `content`, `metadata`?): `Promise`\<[`Message`](../interfaces/Message.md)\>

Publishes a message to a stream partition in the network.

##### Parameters

• **streamDefinition**: [`StreamDefinition`](../api.md#streamdefinition)

the stream or stream partition to publish the message to

• **content**: `unknown`

the content (the payload) of the message (must be JSON serializable)

• **metadata?**: [`PublishMetadata`](../interfaces/PublishMetadata.md)

provide additional metadata to be included in the message or to control the publishing process

##### Returns

`Promise`\<[`Message`](../interfaces/Message.md)\>

the published message (note: the field [Message.content](../interfaces/Message.md#content) is encrypted if the stream is private)

***

#### resend()

> **resend**(`streamDefinition`, `options`, `onMessage`?): `Promise`\<[`MessageStream`](MessageStream.md)\>

Performs a resend of stored historical data.

##### Parameters

• **streamDefinition**: [`StreamDefinition`](../api.md#streamdefinition)

the stream partition for which data should be resent

• **options**: [`ResendOptions`](../api.md#resendoptions)

defines the kind of resend that should be performed

• **onMessage?**: [`MessageListener`](../api.md#messagelistener)

callback will be invoked for each message retrieved

##### Returns

`Promise`\<[`MessageStream`](MessageStream.md)\>

a [MessageStream](MessageStream.md) that provides an alternative way of iterating messages. Rejects if the stream is
not stored (i.e. is not assigned to a storage node).

***

#### subscribe()

> **subscribe**(`options`, `onMessage`?): `Promise`\<[`Subscription`](Subscription.md)\>

Subscribes to a stream partition in the network.

##### Parameters

• **options**: [`SubscribeOptions`](../api.md#subscribeoptions)

the stream or stream partition to subscribe to,
additionally a resend can be performed by providing resend options

• **onMessage?**: [`MessageListener`](../api.md#messagelistener)

callback will be invoked for each message received in subscription

##### Returns

`Promise`\<[`Subscription`](Subscription.md)\>

a [Subscription](Subscription.md) that can be used to manage the subscription etc.

***

#### unsubscribe()

> **unsubscribe**(`streamDefinitionOrSubscription`?): `Promise`\<`unknown`\>

Unsubscribes from streams or stream partitions in the network.

##### Parameters

• **streamDefinitionOrSubscription?**: [`StreamDefinition`](../api.md#streamdefinition) \| [`Subscription`](Subscription.md)

leave as `undefined` to unsubscribe from all existing subscriptions.

##### Returns

`Promise`\<`unknown`\>

##### Remarks

no-op if subscription does not exist

### Other

#### addEncryptionKey()

> **addEncryptionKey**(`key`, `publisherId`): `Promise`\<`void`\>

Adds an encryption key for a given publisher to the key store.

##### Parameters

• **key**: [`EncryptionKey`](EncryptionKey.md)

• **publisherId**: `string`

##### Returns

`Promise`\<`void`\>

##### Remarks

Keys will be added to the store automatically by the client as encountered. This method can be used to
manually add some known keys into the store.

***

#### addStreamToStorageNode()

> **addStreamToStorageNode**(`streamIdOrPath`, `storageNodeAddress`, `opts`): `Promise`\<`void`\>

Assigns a stream to a storage node.

##### Parameters

• **streamIdOrPath**: `string`

• **storageNodeAddress**: `string`

• **opts** = `...`

control how long to wait for storage node to pick up on assignment

• **opts.timeout?**: `number`

• **opts.wait**: `boolean`

##### Returns

`Promise`\<`void`\>

If opts.wait=true, the promise resolves when the storage node acknowledges the assignment and
is therefore ready to store published messages. If we don't receive the acknowledgment within the `timeout`,
the promise rejects, but the assignment may still succeed later.

***

#### connect()

> **connect**(): `Promise`\<`void`\>

Used to manually initialize the network stack and connect to the network.

##### Returns

`Promise`\<`void`\>

##### Remarks

Connecting is handled automatically by the client. Generally this method need not be called by the user.

***

#### deleteStream()

> **deleteStream**(`streamIdOrPath`): `Promise`\<`void`\>

Deletes a stream.

##### Parameters

• **streamIdOrPath**: `string`

##### Returns

`Promise`\<`void`\>

***

#### destroy()

> **destroy**(): `Promise`\<`void`\>

Destroys an instance of a [StreamrClient](StreamrClient.md) by disconnecting from peers, clearing any pending tasks, and
freeing up resources. This should be called once a user is done with the instance.

##### Returns

`Promise`\<`void`\>

##### Remarks

As the name implies, the client instance (or any streams or subscriptions returned by it) should _not_
be used after calling this method.

***

#### findOperators()

> **findOperators**(`streamId`): `Promise`\<[`NetworkPeerDescriptor`](../interfaces/NetworkPeerDescriptor.md)[]\>

##### Parameters

• **streamId**: [`StreamID`](../api.md#streamid)

##### Returns

`Promise`\<[`NetworkPeerDescriptor`](../interfaces/NetworkPeerDescriptor.md)[]\>

***

#### getAddress()

> **getAddress**(): `Promise`\<`string`\>

Alias to [getUserId()](StreamrClient.md#getuserid)

##### Returns

`Promise`\<`string`\>

***

#### ~~getConfig()~~

> **getConfig**(): [`StrictStreamrClientConfig`](../api.md#strictstreamrclientconfig)

##### Returns

[`StrictStreamrClientConfig`](../api.md#strictstreamrclientconfig)

##### Deprecated

This in an internal method

***

#### getDiagnosticInfo()

> **getDiagnosticInfo**(): `Promise`\<`Record`\<`string`, `unknown`\>\>

Get diagnostic info about the underlying network. Useful for debugging issues.

##### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

##### Remark

returned object's structure can change without semver considerations

***

#### getEthersOverrides()

> **getEthersOverrides**(): `Promise`\<[`Overrides`](../interfaces/Overrides.md)\>

Get overrides for transaction options. Use as a parameter when submitting
transactions via ethers library.

##### Returns

`Promise`\<[`Overrides`](../interfaces/Overrides.md)\>

***

#### ~~getNode()~~

> **getNode**(): `NetworkNodeFacade`

##### Returns

`NetworkNodeFacade`

##### Deprecated

This in an internal method

***

#### getNodeId()

> **getNodeId**(): `Promise`\<[`DhtAddress`](../api.md#dhtaddress)\>

Get the network-level node id of the client.

##### Returns

`Promise`\<[`DhtAddress`](../api.md#dhtaddress)\>

***

#### getPeerDescriptor()

> **getPeerDescriptor**(): `Promise`\<[`NetworkPeerDescriptor`](../interfaces/NetworkPeerDescriptor.md)\>

##### Returns

`Promise`\<[`NetworkPeerDescriptor`](../interfaces/NetworkPeerDescriptor.md)\>

***

#### getPermissions()

> **getPermissions**(`streamIdOrPath`): `Promise`\<[`PermissionAssignment`](../api.md#permissionassignment)[]\>

Returns the list of all permissions in effect for a given stream.

##### Parameters

• **streamIdOrPath**: `string`

##### Returns

`Promise`\<[`PermissionAssignment`](../api.md#permissionassignment)[]\>

***

#### getSigner()

> **getSigner**(): `Promise`\<[`SignerWithProvider`](../api.md#signerwithprovider)\>

Gets the Signer associated with the current [StreamrClient](StreamrClient.md) instance.

##### Returns

`Promise`\<[`SignerWithProvider`](../api.md#signerwithprovider)\>

***

#### getStorageNodeMetadata()

> **getStorageNodeMetadata**(`storageNodeAddress`): `Promise`\<[`StorageNodeMetadata`](../interfaces/StorageNodeMetadata.md)\>

Gets the metadata of a storage node from the storage node registry.

##### Parameters

• **storageNodeAddress**: `string`

##### Returns

`Promise`\<[`StorageNodeMetadata`](../interfaces/StorageNodeMetadata.md)\>

rejects if the storage node is not found

***

#### getStorageNodes()

> **getStorageNodes**(`streamIdOrPath`?): `Promise`\<`string`[]\>

Gets a list of storage nodes.

##### Parameters

• **streamIdOrPath?**: `string`

if a stream is given, returns the list of storage nodes the stream has been assigned to;
leave as `undefined` to return all storage nodes

##### Returns

`Promise`\<`string`[]\>

***

#### getStoredStreams()

> **getStoredStreams**(`storageNodeAddress`): `Promise`\<`object`\>

Gets all streams assigned to a storage node.

##### Parameters

• **storageNodeAddress**: `string`

##### Returns

`Promise`\<`object`\>

a list of [Stream](Stream.md) as well as `blockNumber` of result (i.e. blockchain state)

###### blockNumber

> **blockNumber**: `number`

###### streams

> **streams**: [`Stream`](Stream.md)[]

***

#### getStreamPublishers()

> **getStreamPublishers**(`streamIdOrPath`): `AsyncIterable`\<`string`, `any`, `any`\>

Gets all user ids that have [StreamPermission.PUBLISH](../enumerations/StreamPermission.md#publish) permission to the stream.

##### Parameters

• **streamIdOrPath**: `string`

##### Returns

`AsyncIterable`\<`string`, `any`, `any`\>

***

#### getStreamSubscribers()

> **getStreamSubscribers**(`streamIdOrPath`): `AsyncIterable`\<`string`, `any`, `any`\>

Gets all user ids that have [StreamPermission.SUBSCRIBE](../enumerations/StreamPermission.md#subscribe) permission to the stream.

##### Parameters

• **streamIdOrPath**: `string`

##### Returns

`AsyncIterable`\<`string`, `any`, `any`\>

***

#### getUserId()

> **getUserId**(): `Promise`\<`string`\>

Gets the user id (i.e. Ethereum address) of the wallet associated with the current [StreamrClient](StreamrClient.md) instance.

##### Returns

`Promise`\<`string`\>

***

#### grantPermissions()

> **grantPermissions**(`streamIdOrPath`, ...`assignments`): `Promise`\<`void`\>

Grants permissions on a given stream.

##### Parameters

• **streamIdOrPath**: `string`

• ...**assignments**: [`PermissionAssignment`](../api.md#permissionassignment)[]

##### Returns

`Promise`\<`void`\>

***

#### hasPermission()

> **hasPermission**(`query`): `Promise`\<`boolean`\>

Checks whether the given permission is in effect.

##### Parameters

• **query**: [`PermissionQuery`](../api.md#permissionquery)

##### Returns

`Promise`\<`boolean`\>

***

#### inspect()

> **inspect**(`node`, `streamDefinition`): `Promise`\<`boolean`\>

##### Parameters

• **node**: [`NetworkPeerDescriptor`](../interfaces/NetworkPeerDescriptor.md)

• **streamDefinition**: [`StreamDefinition`](../api.md#streamdefinition)

##### Returns

`Promise`\<`boolean`\>

***

#### isStoredStream()

> **isStoredStream**(`streamIdOrPath`, `storageNodeAddress`): `Promise`\<`boolean`\>

Checks whether a stream is assigned to a storage node.

##### Parameters

• **streamIdOrPath**: `string`

• **storageNodeAddress**: `string`

##### Returns

`Promise`\<`boolean`\>

***

#### isStreamPublisher()

> **isStreamPublisher**(`streamIdOrPath`, `userId`): `Promise`\<`boolean`\>

Checks whether a given ethereum address has [StreamPermission.PUBLISH](../enumerations/StreamPermission.md#publish) permission to a stream.

##### Parameters

• **streamIdOrPath**: `string`

• **userId**: `string`

##### Returns

`Promise`\<`boolean`\>

***

#### isStreamSubscriber()

> **isStreamSubscriber**(`streamIdOrPath`, `userId`): `Promise`\<`boolean`\>

Checks whether a given ethereum address has [StreamPermission.SUBSCRIBE](../enumerations/StreamPermission.md#subscribe) permission to a stream.

##### Parameters

• **streamIdOrPath**: `string`

• **userId**: `string`

##### Returns

`Promise`\<`boolean`\>

***

#### off()

> **off**\<`T`\>(`eventName`, `listener`): `void`

Removes an event listener from the client.

##### Type Parameters

• **T** *extends* keyof [`StreamrClientEvents`](../interfaces/StreamrClientEvents.md)

##### Parameters

• **eventName**: `T`

event name, see [StreamrClientEvents](../interfaces/StreamrClientEvents.md) for options

• **listener**: [`StreamrClientEvents`](../interfaces/StreamrClientEvents.md)\[`T`\]

the callback function to remove

##### Returns

`void`

***

#### on()

> **on**\<`T`\>(`eventName`, `listener`): `void`

Adds an event listener to the client.

##### Type Parameters

• **T** *extends* keyof [`StreamrClientEvents`](../interfaces/StreamrClientEvents.md)

##### Parameters

• **eventName**: `T`

event name, see [StreamrClientEvents](../interfaces/StreamrClientEvents.md) for options

• **listener**: [`StreamrClientEvents`](../interfaces/StreamrClientEvents.md)\[`T`\]

the callback function

##### Returns

`void`

***

#### once()

> **once**\<`T`\>(`eventName`, `listener`): `void`

Adds an event listener to the client that is invoked only once.

##### Type Parameters

• **T** *extends* keyof [`StreamrClientEvents`](../interfaces/StreamrClientEvents.md)

##### Parameters

• **eventName**: `T`

event name, see [StreamrClientEvents](../interfaces/StreamrClientEvents.md) for options

• **listener**: [`StreamrClientEvents`](../interfaces/StreamrClientEvents.md)\[`T`\]

the callback function

##### Returns

`void`

***

#### removeStreamFromStorageNode()

> **removeStreamFromStorageNode**(`streamIdOrPath`, `storageNodeAddress`): `Promise`\<`void`\>

Unassigns a stream from a storage node.

##### Parameters

• **streamIdOrPath**: `string`

• **storageNodeAddress**: `string`

##### Returns

`Promise`\<`void`\>

***

#### revokePermissions()

> **revokePermissions**(`streamIdOrPath`, ...`assignments`): `Promise`\<`void`\>

Revokes permissions on a given stream.

##### Parameters

• **streamIdOrPath**: `string`

• ...**assignments**: [`PermissionAssignment`](../api.md#permissionassignment)[]

##### Returns

`Promise`\<`void`\>

***

#### searchStreams()

> **searchStreams**(`term`, `permissionFilter`, `orderBy`): `AsyncIterable`\<[`Stream`](Stream.md), `any`, `any`\>

Searches for streams based on given criteria.

##### Parameters

• **term**: `undefined` \| `string`

a search term that should be part of the stream id of a result

• **permissionFilter**: `undefined` \| [`SearchStreamsPermissionFilter`](../interfaces/SearchStreamsPermissionFilter.md)

permissions that should be in effect for a result

• **orderBy**: [`SearchStreamsOrderBy`](../interfaces/SearchStreamsOrderBy.md) = `...`

the default is ascending order by stream id field

##### Returns

`AsyncIterable`\<[`Stream`](Stream.md), `any`, `any`\>

***

#### setPermissions()

> **setPermissions**(...`items`): `Promise`\<`void`\>

Sets a list of permissions to be in effect.

##### Parameters

• ...**items**: `object`[]

##### Returns

`Promise`\<`void`\>

##### Remarks

Can be used to set the permissions of multiple streams in one transaction. Great for doing bulk
operations and saving gas costs. Notice that the behaviour is overwriting, therefore any existing permissions not
defined will be removed (per stream).

***

#### setProxies()

> **setProxies**(`streamDefinition`, `nodes`, `direction`, `connectionCount`?): `Promise`\<`void`\>

##### Parameters

• **streamDefinition**: [`StreamDefinition`](../api.md#streamdefinition)

• **nodes**: [`NetworkPeerDescriptor`](../interfaces/NetworkPeerDescriptor.md)[]

• **direction**: [`ProxyDirection`](../enumerations/ProxyDirection.md)

• **connectionCount?**: `number`

##### Returns

`Promise`\<`void`\>

***

#### setStorageNodeMetadata()

> **setStorageNodeMetadata**(`metadata`): `Promise`\<`void`\>

Sets the metadata of a storage node in the storage node registry.

##### Parameters

• **metadata**: `undefined` \| [`StorageNodeMetadata`](../interfaces/StorageNodeMetadata.md)

if `undefined`, removes the storage node from the registry

##### Returns

`Promise`\<`void`\>

##### Remarks

Acts on behalf of the wallet associated with the current [StreamrClient](StreamrClient.md) instance.

***

#### setStreamMetadata()

> **setStreamMetadata**(`streamIdOrPath`, `metadata`): `Promise`\<`void`\>

Updates the metadata of a stream.

##### Parameters

• **streamIdOrPath**: `string`

• **metadata**: [`StreamMetadata`](../api.md#streammetadata)

##### Returns

`Promise`\<`void`\>

***

#### setStreamPartitionEntryPoints()

> **setStreamPartitionEntryPoints**(`streamDefinition`, `entryPoints`): `Promise`\<`void`\>

Used to set known entry points for a stream partition. If entry points are not set they
will be automatically discovered from the Streamr Network.

##### Parameters

• **streamDefinition**: [`StreamDefinition`](../api.md#streamdefinition)

• **entryPoints**: [`NetworkPeerDescriptor`](../interfaces/NetworkPeerDescriptor.md)[]

##### Returns

`Promise`\<`void`\>

***

#### updateEncryptionKey()

> **updateEncryptionKey**(`opts`): `Promise`\<`void`\>

Manually updates the encryption key used when publishing messages to a given stream.

##### Parameters

• **opts**: [`UpdateEncryptionKeyOptions`](../interfaces/UpdateEncryptionKeyOptions.md)

##### Returns

`Promise`\<`void`\>

***

#### waitForStorage()

> **waitForStorage**(`message`, `options`?): `Promise`\<`void`\>

Waits for a message to be stored by a storage node.

##### Parameters

• **message**: [`Message`](../interfaces/Message.md)

the message to be awaited for

• **options?**

additional options for controlling waiting and message matching

• **options.count?**: `number`

Controls size of internal resend used in polling.

• **options.interval?**: `number`

Determines how often should storage node be polled.

• **options.timeout?**: `number`

Timeout after which to give up if message was not seen.

##### Returns

`Promise`\<`void`\>

rejects if message was found in storage before timeout
