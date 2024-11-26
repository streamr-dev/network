# Interface: ControlLayerConfig

## Properties

### autoCertifierConfigFile?

> `optional` **autoCertifierConfigFile**: `string`

File path to the autocertified subdomain file. The file contains the autocertified subdomain name
and it's TLS certificate.

***

### autoCertifierUrl?

> `optional` **autoCertifierUrl**: `string`

URL of the autocertifier service used to obtain TLS certificates and subdomain names for the WS server.

***

### entryPointDiscovery?

> `optional` **entryPointDiscovery**: [`EntryPointDiscovery`](EntryPointDiscovery.md)

If true, an attempt is made to discover additional network entrypoint nodes
by querying them from The Graph. If false, only the nodes
listed in entryPoints are used.

***

### entryPoints?

> `optional` **entryPoints**: [`NetworkPeerDescriptor`](NetworkPeerDescriptor.md)[]

The list of entry point PeerDescriptors used to join the Streamr Network.

***

### externalIp?

> `optional` **externalIp**: `string`

***

### geoIpDatabaseFolder?

> `optional` **geoIpDatabaseFolder**: `string`

Define a geo ip database folder path to be used by the network node. When left undefined
geoip functionality is disabled.

***

### iceServers?

> `optional` **iceServers**: [`IceServer`](IceServer.md)[]

The list of STUN and TURN servers to use in ICE protocol when
forming WebRTC connections.

***

### maxConnections?

> `optional` **maxConnections**: `number`

The maximum number of connections before unwanted connections are clean up.
This is a soft limit, meaning that the number of connections may exceed the count temporarily.
Locked connections such as the ones used for stream operations are not counted towards this limit.

***

### maxMessageSize?

> `optional` **maxMessageSize**: `number`

The maximum outgoing message size (in bytes) accepted by connections.
Messages exceeding the maximum size are simply discarded.

***

### networkConnectivityTimeout?

> `optional` **networkConnectivityTimeout**: `number`

The maximum time to wait when establishing connectivity to the control layer. If the connection
is not formed within this time, the client's network node will throw an error.

***

### peerDescriptor?

> `optional` **peerDescriptor**: [`NetworkPeerDescriptor`](NetworkPeerDescriptor.md)

Contains connectivity information to the client's Network Node, used in the network layer.
Can be used in cases where the client's public IP address is known before
starting the network node. If not specified, the PeerDescriptor will be auto-generated.

***

### tlsCertificate?

> `optional` **tlsCertificate**: `TlsCertificate`

TLS configuration for the WebSocket server

***

### webrtcAllowPrivateAddresses?

> `optional` **webrtcAllowPrivateAddresses**: `boolean`

When set to true private addresses will not be probed when forming
WebRTC connections.

Probing private addresses can trigger false-positive incidents in
some port scanning detection systems employed by web hosting
providers. Disallowing private addresses may prevent direct
connections from being formed between nodes using IPv4 addresses
on a local network.

Details: https://github.com/streamr-dev/network/wiki/WebRTC-private-addresses

***

### webrtcDatachannelBufferThresholdHigh?

> `optional` **webrtcDatachannelBufferThresholdHigh**: `number`

Sets the high-water mark used by send buffers of WebRTC connections.

***

### webrtcDatachannelBufferThresholdLow?

> `optional` **webrtcDatachannelBufferThresholdLow**: `number`

Sets the low-water mark used by send buffers of WebRTC connections.

***

### webrtcPortRange?

> `optional` **webrtcPortRange**: [`PortRange`](PortRange.md)

Defines a custom UDP port range to be used for WebRTC connections.
This port range should not be restricted by enclosing firewalls
or virtual private cloud configurations. NodeJS only.

***

### websocketHost?

> `optional` **websocketHost**: `string`

The host name or IP address of the WebSocket server used to connect to it over the internet.
If not specified, the host name will be auto-detected. 
Can be useful in situations where the host is running behind a reverse-proxy or load balancer.

***

### websocketPortRange?

> `optional` **websocketPortRange**: `null` \| [`PortRange`](PortRange.md)

The port range used to find a free port for the client's network layer WebSocket server.
If set to `null`, a server will not be started.
The server is used by the network layer to accept incoming connections
over the public internet to improve the network node's connectivity.

***

### websocketServerEnableTls?

> `optional` **websocketServerEnableTls**: `boolean`

If the node is running a WS server, this option can be used to disable TLS autocertification to
run the server without TLS. This will speed up the starting time of the network node 
(especially when starting the node for the first time on a new machine).
