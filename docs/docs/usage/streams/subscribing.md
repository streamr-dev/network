---
sidebar_position: 4
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Subscribing
Subscribing to a stream means to read/consume data/messages from a stream. 

Applications publish and subscribe to streams via Streamr nodes. In other words, nodes are the access points to the Streamr Network. You can either run a light node which is imported as a library and runs locally as part of your application (Streamr SDK) or you can interface your app with a Streamr node. The Streamr node runs separately, and your application connects to it remotely using one of the supported protocols, WebSockets, HTTP or MQTT.

### Subscribe code snippets
<Tabs groupId="environment">
  
  <TabItem value="js-client" label="Streamr SDK">

```ts
// Run a Streamr node right inside your JS app
const Streamr = require('@streamr/sdk')
const { StreamrClient } = require('@streamr/sdk')

// Initialize the Streamr SDK with an Ethereum account
// If the stream is private then this account will need
// the subscribe permission on this stream to subscribe
const streamr = new Streamr({
  auth: {
    // If the stream is public, you can leave this out
    privateKey: 'ethereum-private-key',
  },
});

// Subscribe to the stream of messages
streamr.subscribe(
  streamId,
  (content, metadata) => { ... }
    // Handle incoming messages
  }
);
```

</TabItem>
<TabItem value="bn-websocket" label="Streamr node WebSocket">

```ts
// Use your favourite language and Websocket library!
// https://github.com/streamr-dev/network/blob/main/packages/broker/plugins.md

// You'll want to URI-encode the stream id
const streamId = encodeURIComponent(
  streamId
);

// Connect to the Websocket interface on your Streamr node
const sub = ws.connect(`ws://127.0.0.1:7170/streams/${streamId}/subscribe`);

// Use the Streamr node to subscribe to the stream.
// If this stream is private then make sure that your Streamr node
// has subscribe permission to subscribe to this stream
sub.onmessage = (msg) => {
  // Handle incoming messages
};
```

</TabItem>

<TabItem value="bn-http" label="Streamr node HTTP">

```ts
N / A;
```

</TabItem>

<TabItem value="bn-mqtt" label="Streamr node MQTT">

```ts
// Use your favourite language and MQTT library!
// https://github.com/streamr-dev/network/blob/main/packages/broker/plugins.md

// Connect to MQTT interface on your Streamr node
mqtt.connect('mqtt://127.0.0.1:1883');

// Use the Streamr node to subscribe to the stream.
// If this stream is private then make sure that your Streamr node
// has subscribe permission to subscribe to this stream
mqtt.subscribe(
  streamId,
  (content, metadata) => { ... }
    // Handle incoming messages
  }
);
```

</TabItem>
</Tabs>

### Unsubscribing from a subscription
```ts
await streamr.unsubscribe(streamId);
// or, unsubscribe them all:
const streams = await streamr.unsubscribe();
```

### Getting all subscriptions
```ts
const subscriptions = streamr.getSubscriptions();
```