# Interface: NetworkNodeConfig

## Properties

### acceptProxyConnections?

> `optional` **acceptProxyConnections**: `boolean`

Whether to accept proxy connections. Enabling this option allows
this network node to act as proxy on behalf of other nodes / clients.
When enabling this option, a WebSocket server should be configured for the client
and the node needs to be in the open internet. The server can be started by setting
the websocketPort configuration to a free port in the network control layer configuration.

***

### streamPartitionMinPropagationTargets?

> `optional` **streamPartitionMinPropagationTargets**: `number`

The minimum number of peers in a stream partition that the client's network node
will attempt to propagate messages to

***

### streamPartitionNeighborTargetCount?

> `optional` **streamPartitionNeighborTargetCount**: `number`

The number of connections the client's network node should have
on each stream partition.
