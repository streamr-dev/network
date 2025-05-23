---
sidebar_position: 6
---

# Store and retrieve data

You can enable data storage on your streams to retain historical message and access it later via a `resend`. Storage needs to be enabled and is not on by default. Storage is currently centralized and offered via the Streamr Storage nodes.

:::info Good to know:
To retrieve data from storage, a key exchange between the publisher and subscriber needs to be performed. This means that the publisher must be online and present in the Network at the time of the retrieval. You can get around this liveness requirement by using the Lit protocol for key exchange (see #[Working with Lit](#working-with-lit-protocol)).
:::

## Enable storage

```ts
const {
  StreamrClient,
    STREAMR_STORAGE_NODE_ADDRESS,
} = require('@streamr/sdk');

// assign a stream to a storage node
await stream.addToStorageNode(STREAMR_STORAGE_NODE_ADDRESS);
```

Other operations with storage:

```ts
// remove the stream from a storage node
await stream.removeFromStorageNode(STREAMR_STORAGE_NODE_ADDRESS);

// fetch the storage nodes for a stream
const storageNodes = stream.getStorageNodes();
```

## Request historical messages

:::caution Important:
In order to fetch historical messages the stream needs to have **[storage enabled](#enable-storage)**.
:::

By default `subscribe` will not request historical messages.

### Fetch historical messages with the `resend` method

```ts
// Fetches the last 10 messages stored for the stream
const resend1 = await streamr.resend(
  streamId,
  {
    last: 10,
  },
  (msg) => {
    console.log(msg);
  }
);
```

### Fetch historical messages and subscribe to real-time messages

```ts
// Fetches the last 10 messages and subscribes to the stream
const sub1 = await streamr.subscribe(
  {
    id: streamId,
    resend: {
      last: 10,
    },
  },
  (msg) => {
    console.log(msg);
  }
);
```

### Resend from a specific timestamp up to the newest message

```ts
const sub2 = await streamr.resend(streamId, {
  from: {
    timestamp: Date.now() - 1000 * 60 * 5, // 5 minutes ago
    sequenceNumber: 0, // optional
  },
  publisher: '0x12345...', // optional
});
```

### Resend a range of messages

```ts
const sub3 = await streamr.resend(streamId, {
  from: {
    timestamp: Date.now() - 1000 * 60 * 10, // 10 minutes ago
  },
  to: {
    timestamp: Date.now() - 1000 * 60 * 5, // 5 minutes ago
  },
  // when using from and to the following parameters are optional
  // but, if specified, both must be present
  publisher: '0x12345...',
  msgChainId: 'ihuzetvg0c88ydd82z5o',
});
```

### Listen to completion of resend

If you choose one of the above resend options when subscribing, you can listen on the completion of this resend by doing the following:

```ts
const sub = await streamr.subscribe(options);
sub.once('resendCompleted', () => {
  console.log(
    'Received all requested historical messages! Now switching to real time!'
  );
});
```

Note that only one of the resend options can be used for a particular subscription.
