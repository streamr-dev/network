---
sidebar_position: 3
---

# Connect to a proxy Broker node
### Proxy publishing and subscribing
In some cases the client might be interested in publishing messages without participating in the stream's message propagation. With this option the nodes can sign all messages they publish by themselves. Alternatively, a client could open a WS connection to a broker node and allow the broker to handle signing with its private key.

Setting subscribe proxies can be useful for cases where broker nodes with public IP addresses do not exist in a stream.

Proxy publishing and subscribing are handled on the network overlay level. This means that there is no need to know the IP address of the node that will be used as a proxy. Instead, the node needs to know the ID of the network node it wants to connect to. It is not possible to set publish / subscribe proxies for a stream that is already being "traditionally" subscribed or published to and vice versa.

To open publish proxy connections to multiple nodes on a stream partition:

```js
await publishingClient.setProxies(streamPartition, ['0x11111...', '0x22222...'], ProxyDirection.PUBLISH)
```

To remove some/all proxies, call the same method with a different set of nodes. If the node list is empty, proxies are no longer used for the given stream partition:

```js
await publishingClient.setProxies(streamPartition, [], ProxyDirection.PUBLISH)
```

By default the client will attempt to open proxy connections to all of the nodes set in  `setProxies`. You can limit the number of connections by setting the `connectionCount` parameter. In this approach, if the client is disconnected from one of the nodes it will attempt to connect to another node by random:

```js
// Opens 2 connections, with an extra candidate to use in case of disconnections
await publishingClient.setProxies(streamPartition, ['0x11111...', '0x22222...', '0x33333...'], ProxyDirection.PUBLISH, 2)
```

:::caution Important:
The node that is used as a proxy must have set the option on the network layer to accept incoming proxy connections and must have joined to the stream that a proxy connection is wanted for.
:::

### Example JS Client config

```json
{
    ...
    "network": {
        ...
        "acceptProxyConnections": true
    }
}
```

### Example Broker config

```json
{
    ...
    "client": {
        ...
        "network": {
            ...
            "acceptProxyConnections": true
        }
    },
    "plugins": {
        ...
        "subscriber": {
            "streams": [
                {
                    "streamId": "STREAM_ID",
                    "streamPartition": 0
                },
                {
                    "streamId": "STREAM_ID2",
                    "streamPartition": 0
                },
            ]
        }
    }
}
```