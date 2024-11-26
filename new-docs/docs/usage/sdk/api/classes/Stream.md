# Class: Stream

A convenience API for managing and accessing an individual stream.

## Properties

### id

> `readonly` **id**: [`StreamID`](../api.md#streamid)

## Methods

### Important

#### addToStorageNode()

> **addToStorageNode**(`storageNodeAddress`, `opts`): `Promise`\<`void`\>

See [StreamrClient.addStreamToStorageNode](StreamrClient.md#addstreamtostoragenode).

##### Parameters

• **storageNodeAddress**: `string`

• **opts** = `...`

• **opts.timeout?**: `number`

• **opts.wait**: `boolean`

##### Returns

`Promise`\<`void`\>

***

#### getPermissions()

> **getPermissions**(): `Promise`\<[`PermissionAssignment`](../api.md#permissionassignment)[]\>

See [StreamrClient.getPermissions](StreamrClient.md#getpermissions).

##### Returns

`Promise`\<[`PermissionAssignment`](../api.md#permissionassignment)[]\>

***

#### grantPermissions()

> **grantPermissions**(...`assignments`): `Promise`\<`void`\>

See [StreamrClient.grantPermissions](StreamrClient.md#grantpermissions).

##### Parameters

• ...**assignments**: [`PermissionAssignment`](../api.md#permissionassignment)[]

##### Returns

`Promise`\<`void`\>

***

#### hasPermission()

> **hasPermission**(`query`): `Promise`\<`boolean`\>

See [StreamrClient.hasPermission](StreamrClient.md#haspermission).

##### Parameters

• **query**: `Omit`\<[`UserPermissionQuery`](../interfaces/UserPermissionQuery.md), `"streamId"`\> \| `Omit`\<[`PublicPermissionQuery`](../interfaces/PublicPermissionQuery.md), `"streamId"`\>

##### Returns

`Promise`\<`boolean`\>

***

#### publish()

> **publish**(`content`, `metadata`?): `Promise`\<[`Message`](../interfaces/Message.md)\>

See [StreamrClient.publish](StreamrClient.md#publish).

##### Parameters

• **content**: `unknown`

• **metadata?**: [`PublishMetadata`](../interfaces/PublishMetadata.md)

##### Returns

`Promise`\<[`Message`](../interfaces/Message.md)\>

***

#### revokePermissions()

> **revokePermissions**(...`assignments`): `Promise`\<`void`\>

See [StreamrClient.revokePermissions](StreamrClient.md#revokepermissions).

##### Parameters

• ...**assignments**: [`PermissionAssignment`](../api.md#permissionassignment)[]

##### Returns

`Promise`\<`void`\>

### Other

#### getDescription()

> **getDescription**(): `undefined` \| `string`

##### Returns

`undefined` \| `string`

***

#### getMetadata()

> **getMetadata**(): [`StreamMetadata`](../api.md#streammetadata)

Returns the metadata of the stream.

##### Returns

[`StreamMetadata`](../api.md#streammetadata)

***

#### getPartitionCount()

> **getPartitionCount**(): `number`

##### Returns

`number`

***

#### getStorageDayCount()

> **getStorageDayCount**(): `undefined` \| `number`

Gets the value of `storageDays` field

##### Returns

`undefined` \| `number`

***

#### getStorageNodes()

> **getStorageNodes**(): `Promise`\<`string`[]\>

See [StreamrClient.getStorageNodes](StreamrClient.md#getstoragenodes).

##### Returns

`Promise`\<`string`[]\>

***

#### getStreamParts()

> **getStreamParts**(): [`StreamPartID`](../api.md#streampartid)[]

Returns the partitions of the stream.

##### Returns

[`StreamPartID`](../api.md#streampartid)[]

***

#### removeFromStorageNode()

> **removeFromStorageNode**(`nodeAddress`): `Promise`\<`void`\>

See [StreamrClient.removeStreamFromStorageNode](StreamrClient.md#removestreamfromstoragenode).

##### Parameters

• **nodeAddress**: `string`

##### Returns

`Promise`\<`void`\>

***

#### setDescription()

> **setDescription**(`description`): `Promise`\<`void`\>

##### Parameters

• **description**: `string`

##### Returns

`Promise`\<`void`\>

***

#### setMetadata()

> **setMetadata**(`metadata`): `Promise`\<`void`\>

Updates the metadata of the stream.

##### Parameters

• **metadata**: [`StreamMetadata`](../api.md#streammetadata)

##### Returns

`Promise`\<`void`\>

***

#### setStorageDayCount()

> **setStorageDayCount**(`count`): `Promise`\<`void`\>

Sets the value of `storageDays` field

##### Parameters

• **count**: `number`

##### Returns

`Promise`\<`void`\>
