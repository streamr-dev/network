---
sidebar_position: 5
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Publishing
Publishing to a stream means to write or push data/messages to a stream. 

Applications publish and subscribe to streams via Streamr nodes. In other words, nodes are the access points to the Streamr Network. You can either run a light node which is imported as a library and runs locally as part of your application (Streamr JS client) or you can interface your app with a Streamr Broker node. The Broker node runs separately, and your application connects to it remotely using one of the supported protocols, WebSockets, HTTP or MQTT.

:::caution Important:
You must grant `PUBLISH` permission **before** the user can publish data to the stream.

Learn more about [stream permissions](./permissions.md)
:::

### Publish code snippets
<Tabs groupId="environment">
  <TabItem value="js-client" label="JS client">

```ts
// Run a Streamr node right inside your JS app
const StreamrClient = require('streamr-client');

// Initialize the Client with an Ethereum account
// This account will need the publish permission on this stream to publish
const streamr = new StreamrClient({
  auth: {
    privateKey: 'ethereum-private-key',
  },
});

// Publish messages to this stream
streamr.publish(
  streamId,
  {
    hello: 'world',
  }
);
```

</TabItem>
<TabItem value="bn-websocket" label="Broker node WebSocket">

```ts
// Use your favourite language and Websocket library!
// https://github.com/streamr-dev/network/blob/main/packages/broker/plugins.md

// You'll want to URI-encode the stream id
const streamId = encodeURIComponent(
  streamId
);

// Connect to the Websocket interface on your Streamr Broker node
const pub = ws.connect(`ws://127.0.0.1:7170/streams/${streamId}/publish`);

// Use the Broker node to publish JSON messages to the stream.
// Make sure that your Broker node has permission to publish on this stream
pub.send({
  hello: 'world',
});
```

</TabItem>

<TabItem value="bn-http" label="Broker node HTTP">

```ts
// Use your favourite language and HTTP library!
// https://github.com/streamr-dev/network/blob/main/packages/broker/plugins.md

// You'll want to URI-encode the stream id
const streamId = encodeURIComponent(
  streamId
);

// Use the Broker node to publish JSON messages to the stream.
// Make sure that your Broker node has permission to publish on this stream
http.post(`http://127.0.0.1:7171/streams/${streamId}`, {
  hello: 'world',
});
```

</TabItem>

<TabItem value="bn-mqtt" label="Broker node MQTT">

```ts
// Use your favourite language and MQTT library!
// https://github.com/streamr-dev/network/blob/main/packages/broker/plugins.md

// Connect to MQTT interface on your Streamr node
mqtt.connect('mqtt://127.0.0.1:1883');

// Use the Broker node to publish JSON messages to the stream.
// Make sure that your Broker node has permission to publish on this stream
mqtt.publish(
  streamId,
  {
    hello: 'world',
  }
);
```

</TabItem>
</Tabs>

### Publishing examples
```ts
// Here's our example data point
const msg = {
  temperature: 25.4,
  humidity: 10,
  happy: true,
};

// Publish using the stream id only
await streamr.publish(streamId, msg);

// Publish with a specific timestamp as a Date object (default is now)
await streamr.publish(streamId, msg, { timestamp: new Date(1546300800123) });

// Publish with a specific timestamp in ms
await streamr.publish(streamId, msg, { timestamp: 1546300800123 });

// Publish with a specific timestamp as a ISO8601 string
await streamr.publish(streamId, msg, { timestamp: '2019-01-01T00:00:00.123Z' });

// For convenience, stream.publish(...) equals streamr.publish(stream, ...)
await stream.publish(msg);
```
