# Interface: PeerDescriptor

## Generated

from protobuf message peerDescriptor.PeerDescriptor

## Properties

### ipAddress?

> `optional` **ipAddress**: `number`

#### Generated

from protobuf field: optional uint32 ipAddress = 7;

***

### nodeId

> **nodeId**: `Uint8Array`

#### Generated

from protobuf field: bytes nodeId = 1;

***

### publicKey?

> `optional` **publicKey**: `Uint8Array`

#### Generated

from protobuf field: optional bytes publicKey = 8;

***

### region?

> `optional` **region**: `number`

#### Generated

from protobuf field: optional uint32 region = 6;

***

### signature?

> `optional` **signature**: `Uint8Array`

signature of fields 2-8

#### Generated

from protobuf field: optional bytes signature = 9;

***

### tcp?

> `optional` **tcp**: `ConnectivityMethod`

#### Generated

from protobuf field: peerDescriptor.ConnectivityMethod tcp = 4;

***

### type

> **type**: `NodeType`

#### Generated

from protobuf field: peerDescriptor.NodeType type = 2;

***

### udp?

> `optional` **udp**: `ConnectivityMethod`

#### Generated

from protobuf field: peerDescriptor.ConnectivityMethod udp = 3;

***

### websocket?

> `optional` **websocket**: `ConnectivityMethod`

#### Generated

from protobuf field: peerDescriptor.ConnectivityMethod websocket = 5;
