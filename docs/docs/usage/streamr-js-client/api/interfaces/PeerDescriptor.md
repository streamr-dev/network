---
id: "PeerDescriptor"
title: "Interface: PeerDescriptor"
sidebar_label: "PeerDescriptor"
sidebar_position: 0
custom_edit_url: null
---

**`Generated`**

from protobuf message dht.PeerDescriptor

## Properties

### kademliaId

• **kademliaId**: `Uint8Array`

**`Generated`**

from protobuf field: bytes kademliaId = 1;

___

### nodeName

• `Optional` **nodeName**: `string`

**`Generated`**

from protobuf field: optional string nodeName = 8;

___

### openInternet

• `Optional` **openInternet**: `boolean`

**`Generated`**

from protobuf field: optional bool openInternet = 6;

___

### region

• `Optional` **region**: `number`

**`Generated`**

from protobuf field: optional uint32 region = 7;

___

### tcp

• `Optional` **tcp**: `ConnectivityMethod`

**`Generated`**

from protobuf field: dht.ConnectivityMethod tcp = 4;

___

### type

• **type**: `NodeType`

**`Generated`**

from protobuf field: dht.NodeType type = 2;

___

### udp

• `Optional` **udp**: `ConnectivityMethod`

**`Generated`**

from protobuf field: dht.ConnectivityMethod udp = 3;

___

### websocket

• `Optional` **websocket**: `ConnectivityMethod`

**`Generated`**

from protobuf field: dht.ConnectivityMethod websocket = 5;
