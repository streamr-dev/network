---
sidebar_position: 1
---

# Connect to a Broker node

The Broker node ships with interface plugins, which can be used to publish and subscribe to data from applications over off-the-shelf protocols HTTP, WebSocket, and MQTT. For now, publishing and subscribing is available through these plugins however features such as resends are unavailable at this time.

<!-- TODO: Feature completeness matrix diagram -->

## Configuration

The plugins are enabled and configured in the Broker config file. To generate a config file and enable the plugins you need, you can use the Broker's interactive config wizard.

### Authentication

The plugins expose ports and API endpoints which can be used to publish and subscribe to data using the identity of the Broker node. You will want to secure those ports, either by setting up a firewall and restricting access to the ports based on IP, or configuring API keys that only allow access if the API key is provided.

The API keys can be configured in the Broker config file, in a top-level field `apiAuthentication`:

```json
{
    "network": ...
    "plugins": ...
    "apiAuthentication": {
        "keys": ["my-very-secret-key"]
    }
}
```

By knowing any of the correct API keys, the applications are granted access to the node. The API keys are passed by the application in slightly different ways depending on which protocol is used.

Note that the API keys grant access to publishing and subscribing via your node, while the node's private key grants access to your node's identity and assets. Never confuse API keys and the node's private key, and never send the private key over the internet.

How to pass the API key depends on the protocol in question and is described in the sections below.

### Ports

The integration plugins open TCP server ports to allow applications to connect to them. The ports need to be reachable by those applications, meaning that you may need to allow the port in your firewall and potentially set up appropriate port forwarding in your router. The port number is configurable for each plugin (see below for details).

Note that the Streamr protocol itself (used for communication between nodes) does not require any ports to be opened.

## WebSocket

The WebSocket plugin provides a WebSocket interface for publishing and subscribing.

To enable the WebSocket plugin, define a `websocket` object in the `plugins` section of the Broker configuration file:

```json
plugins: {
    "websocket": {}
}
```

You can subscribe by creating a standard JavaScript WebSocket connection:

```ts
const socket = new WebSocket(
  `ws://localhost:${port}/streams/${encodeURIComponent(streamId)}/subscribe`
);
socket.addEventListener('message', (message) => {
  console.log(JSON.parse(message.data));
});
```

And publish to a stream similarly:

```ts
const socket = new WebSocket(
  `ws://localhost:${port}/streams/${encodeURIComponent(streamId)}/publish`
);
socket.addEventListener('open', () => {
  socket.send(JSON.stringify(message));
});
```

#### Passing the API key

Pass the API key by adding an `apiKey` query parameter to the connection URL:

```
const socket = new WebSocket(`...?apiKey=my-secret-api-key`)
```

#### Advanced usage

##### Port

The default WebSocket port is `7170`. You can change it by specifying a `port` value:

```ts
plugins: {
    "websocket": {
        "port": 1234
    }
}
```

#### Explicit metadata

By default the payload is the plain content of a stream message.

If you want to provide some metadata for messages (e.g. explicit timestamps), set the `payloadMetadata` option to `true`:

```json
plugins: {
    "websocket": {
        ...
        "payloadMetadata": true
    }
}
```

And restructure the payload to contain `content` and `metadata` fields:

```ts
const content = { foo: 'bar' };
const payload = {
  content,
  metadata: {
    timestamp: 1234567890000,
  },
};
socket.send(JSON.stringify(payload));
```

The configuration option affects also the incoming messages. Those messages will be derived in the same restructured format.

#### Partitions

If you want to publish or subscribe to a specific partition of a stream, you can add query parameters to the URL:

- `/streams/:streamId/subscribe?partitions=0,2,5`: subscribes to given partition numbers
- `/streams/:streamId/publish?partition=2`: publishes to given partition number
- `/streams/:streamId/publish?partitionKey=foo`: use the given key to calculate the partition number, [see stream partitioning](../streams/partitioning))
- `/streams/:streamId/publish?partitionKeyField=customerId`: use the given field in a JSON to choose the `paritionKey` (e.g. `{ "customerId": "foo", ...  }` -> `paritionKey` is `foo`)

By default, a random partition is selected.

#### Secure connections

To support a SSL/TLS connections, define a SSL certificate in the Broker config:

```json
"sslCertificate": {
    "certFileName": "path/cert.pem",
    "privateKeyFileName": "path/key.pem"
}
```

And change the connection url to use `wss://` instead of `ws://`:

```ts
const socket = new WebSocket(`wss://...`);
```

**Note**: self-signed certificates don't work well in browser environments (the connection may not open at all). In Node environment self-signed certificates can be trusted by setting the an environment variable `NODE_TLS_REJECT_UNAUTHORIZED=0`. If possible, please obtain an authorized certificate, e.g. from [Let's Encrypt](https://letsencrypt.org).

## MQTT

You can publish and subscribe to a stream using [MQTT](https://mqtt.org), making the Broker appear like a traditional MQTT broker towards connected applications and devices. To enable the MQTT plugin, define an `mqtt` object in the `plugins` section of the Broker configuration file:

```json
plugins: {
    "mqtt": {}
}
```

You can use any MQTT client to connect to the Broker. Here's an example of subscribing to a stream with the [async-mqtt](https://www.npmjs.com/package/async-mqtt) library:

```ts
import mqtt from 'async-mqtt';
const client = await mqtt.connectAsync(`mqtt://localhost:${port}`);
client.on('message', (topic, message) => {
  console.log(JSON.parse(message.toString()));
});
await client.subscribe(streamId);
```

Publishing data with the same library:

```ts
import mqtt from 'async-mqtt';
const client = await mqtt.connectAsync(`mqtt://localhost:${port}`);
await client.publish(streamId, JSON.stringify(msg));
```

#### Passing the API key

The authentication scheme of the MQTT protocol uses a username and password. When connecting to the MQTT plugin of Streamr Broker, you can provide anything you want as the username and the API key as the password:

```ts
mqtt.connectAsync(`mqtt://localhost:${port}`, {
  username: 'any-username',
  password: apiKey,
});
```

Some MQTT clients expect the username and password to be passed in the connection URL:

```ts
mqtt://any-username:my-secret-api-key@localhost:1883
```

#### Advanced usage

##### Port

The default port is `1883`. You can change it with `port` config option.

#### Explicit metadata

Explicit metadata can be provided the same way it is provided to the WebSocket plugin.

#### Topic domains

By default each MQTT `topic` matches a `streamId`. If you want to simplify the client usage, you can specify a domain, which is prefixed to a topic to make a corresponding `streamId`:

```ts
plugins: {
    "mqtt": {
        ...
        "streamIdDomain": "0x1234567890123456789012345678901234567890"  // or "mydomain.eth"
    }
}
```

This way you can publish and subscribe to a stream by using only the path part of a `streamId`

```ts
await client.publish('path-part', ...)  // publishes to a stream "0x1234567890123456789012345678901234567890/path-part"
```

## HTTP

At the moment, only publishing is supported over HTTP. To subscribe, use one of the other protocol plugins as they allow a continuous streaming connection.

To publish over HTTP, enable the `http` plugin:

```ts
plugins: {
    "http": {}
}
```

The plugin provides a single endpoint: `/streams/:streamId`.

Note that the `streamId` is part of the URL and may contain slashes which need to be URL-encoded (`/` becomes `%2f`).

To publish a message to a stream, send the data as a POST payload:

```ts
curl \
--header 'Content-Type: application/json' \
--data '{"foo":"bar"}' \
http://localhost:7171/streams/foo.eth%2fbar
```

The endpoint returns HTTP 200 status if the message was published successfully.

#### Passing the API key

Pass the API key in the `Authorization` header, with content `bearer <key>`, for example

```ts
Authorization: bearer my-secret-api-key
```

A curl example:

```ts
curl \
--header 'Content-Type: application/json' \
--header 'Authorization: bearer my-secret-api-key' \
--data '{"foo":"bar"}' \
http://localhost:7171/streams/foo.eth%2fbar
```

#### Advanced usage

##### Explicit metadata

The endpoint supports the following optional query parameters:

- `timestamp` can be used to set the message timestamp explicitly. The timestamp should be passed in ISO-8601 string (e.g. `2001-02-03T04:05:06Z`), or as milliseconds since epoch, e.g. `1234567890000`
- `partition` (explicit partition number) or `partitionKey` (a string which used to calculate the partition number, [see stream partitioning](../streams/partitioning)). The default (in case neither is provided) is to select a random partition for each message.

##### Port

The default HTTP server port is `7171`. You can change it by specifying a `port` value for the root level `httpServer` option:

```json
"network": ...
"plugins": ...
"httpServer": {
    "port": 1234
}
```

##### Secure connections

If you provide a SSL certificate it will support use SSL/TLS connections:

```json
"httpServer": {
    ...
    "certFileName": "path/cert.pem",
    "privateKeyFileName": "path/key.pem"
}
```
