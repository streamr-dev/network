# Plugins

## Table of Contents
- [Dependencies](#dependencies)
- [Websocket](#websocket)
- [MQTT](#mqtt)
- [PublishHttp](#publishhttp)

## Dependencies

Currently many plugins use `legacyWebsocket` plugin as an internal communication channel. To use `websocket`, `mqtt`, or `publishHttp` plugin, you must enable an additional `legacyWebsocket` plugin in the Broker config:

```
plugins: {
    "legacyWebsocket": {
        port: 9999 // any available port
    }
}
```


## Websocket

The `websocket` plugin provides a websocket interface for publishing and subscribing. 

To enable the plugin, add the plugin definition to the Broker configuration JSON:


```
plugins: {
    "websocket": {
        "port": 7170,  // any available port
        "payloadMetadata": false,
        "sslCertificate": null
    }
}
```

You can subscribe by creating a standard JavaScript Websocket connection:

```
const socket = new WebSocket(`ws://localhost:${port}/streams/${encodeURIComponent(streamId)}/subscribe`)
socket.addEventListener('message', (message) => {
    console.log(JSON.parse(message.data))
})
```

And publish to a stream similarly:

```
const socket = new WebSocket(`ws://localhost:${port}/streams/${encodeURIComponent(streamId)}/publish`)
socket.addEventListener('open', () => {
    socket.send(JSON.stringify(message))
})
```

### Advanced usage

#### Explicit metadata

By default the payload is the plain content of a stream message. 

If you want to provide some metadata for messages (e.g. explicit timestamps), set the `payloadMetadata` option to `true`:

```
plugins: {
    "websocket": {
        ...
        "payloadMetadata": true
    }
}
```

And restructure the payload to contain `content` and `metadata` fields:

```
const content = { "foo": "bar" }
const payload = {
    content,
    metadata: {
        timestamp: 1234567890000
    }
}
socket.send(JSON.stringify(payload))
```

The configuration option affects also the incoming messages. Those messages will be derived in the same restructured format.

#### Authenticated connections

You can restrict that clients can create connections only if they know a secret API key.

To enable the restriction, define some API keys in the Broker's root level `apiAuthentication` config:

```
{
    "network": ...
    "plugins": ...
    "apiAuthentication": {
        "keys": ["foobar"]
    }
}
```

And add the `apiKey` parameter to the connection URL:

```
const socket = new WebSocket(`...?apiKey=foobar`)
```

#### Partitions

If you want to publish or subscribe to a specific partition of a stream, you can add query parameters to the URL:

- `/streams/:streamId/subscribe?partitions=0,2,5`: subscribes to given partition numbers
- `/streams/:streamId/publish?partition=2`: publishes to given partition number
- `/streams/:streamId/publish?partitionKey=foo`: use the given key to calculate the partition number, [see JS-client for details](https://github.com/streamr-dev/network-monorepo/blob/main/packages/client/README.md#publishing-to-partitioned-streams))
- `/streams/:streamId/publish?partitionKeyField=customerId`: use the given field in a JSON to choose the `paritionKey` (e.g. `{ "customerId": "foo", ...  }` -> `paritionKey` is `foo`)

**TODO**: define which partition is used if partition is not specified for publish/subscribe.

#### Secure connections

To support a SSL/TLS connections, define a SSL certificate in the Broker config:

```
"sslCertificate": {
    "certFileName": "path/cert.pem",
    "privateKeyFileName": "path/key.pem"
}
```

And change the connection url to use `wss://` instead of `ws://`:

```
const socket = new WebSocket(`wss://...`)
```

**Note**: self-signed certificates don't work well in browser environments (the connection may not open at all). In Node environment self-signed certificates can be trusted by setting the an environment variable `NODE_TLS_REJECT_UNAUTHORIZED=0`. If possible, please obtain an authorized certificate, e.g. from [Let's Encrypt](https://letsencrypt.org).

## MQTT

As an alternative to Websockets, it is possible to publish and subscribe to a stream using a [MQTT](https://mqtt.org) connection:

```
plugins: {
    "mqtt": {
        "port": 7171,  // any available port,
        "payloadMetadata": false
    }
}
```

You can use any MQTT client to connect to the Broker. E.g subscribe with  [async-mqtt](https://www.npmjs.com/package/async-mqtt) library:

```
import mqtt from 'async-mqtt'
const client = await mqtt.connectAsync(`mqtt://localhost:${port}`)
client.on('message', (topic, message) => {
    console.log(JSON.parse(message.toString()))
})
await client.subscribe(streamId)
```

And publish data with the same library:

```
import mqtt from 'async-mqtt'
const client = mqtt.connectAsync(`mqtt://localhost:${port}`)
await client.publish(streamId, JSON.stringify(msg))
```

### Advanced usage

Explicit metadata can be provided the same way it is provided to the `websocket` plugin ([see above](#explicit-metadata)).

API authentication is also supported. Define the keys in the Broker config ([see above](#authenticated-connections)) and provide the API key as a password when you create a connection:
```
mqtt.connectAsync(`mqtt://localhost:${port}`, {
    username: '',
    password: apiKey,
})
```

**TODO**: define partition support for publish/subscribe.

#### Topic domains

By default each MQTT `topic` matches a `streamId`. If you want to simplify the client usage, you can specify a domain, which is prefixed to a topic to make a corresponding `streamId`:

```
plugins: {
    "mqtt": {
        ...
        "streamIdDomain": "0x1234567890123456789012345678901234567890"  // or "mydomain.eth"
    }
}
```

This way you can publish and subscribe to a stream by using only the path part of a `streamId`

```
await client.publish('foobar', ...)  // publishes to a stream "0x1234567890123456789012345678901234567890/foobar"
```

## PublishHttp

If you want to publish stream data with HTTP POST calls, use the `publishHttp` plugin:

```
plugins: {
    "publishHttp": {}
}
```

The plugin doesn't need any configuration options as it uses the Broker's global `httpServer`.

The `httpServer` is configured in the root level:
```
"network": ...
"plugins": ...
"httpServer": {
    "port": 8080
}
```

If you provide a SSL certificate it will support use SSL/TLS connections:
```
"httpServer": {
    ...
    "certFileName": "path/cert.pem",
    "privateKeyFileName": "path/key.pem"
}
```

The plugin provides a single endpoint: `/streams/:streamId/` with the following optional query parameters:

- `timestamp` in ISO-8601 format e.g. 2001-02-03T04:05:06Z, or as a number 1234567890000
- `partition` (explicit partition number) or `partitionKey` (a string which used to calculate the partition number, [see JS-client for details](https://github.com/streamr-dev/network-monorepo/blob/main/packages/client/README.md#publishing-to-partitioned-streams)) **TODO**: define which partition is used when neither parameter is given

To publish a message to a stream, send the data as a POST payload:

```
curl \
--header 'Content-Type: application/json' \
--data '{"foo":"bar"}' \
http://localhost:8080/streams/foo.eth%2fbar
```

The endpoint returns HTTP 200 status if the message was published successfully. 