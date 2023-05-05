---
sidebar_position: 6
---

# Store and retrieve data

You can enable data storage on your streams to retain historical message and access it later via a `resend`. Storage needs to be enabled and is not on by default. Storage is currently centralized and offered via the Streamr Storage nodes.

:::info Good to know:
To retrieve data from storage, a key exchange between the publisher and subscriber needs to be performed. This means that the publisher must be online and present in the Network at the time of the retrieval. You can get around this liveness requirement by using the Lit protocol for key exchange (see #[Working with Lit](./store-and-retrieve#working-with-lit-protocol)).
:::

## Enable storage

```ts
const {
  StreamrClient,
  STREAMR_STORAGE_NODE_GERMANY,
} = require('streamr-client');

// assign a stream to a storage node
await stream.addToStorageNode(STREAMR_STORAGE_NODE_GERMANY);
```

Other operations with storage:

```ts
// remove the stream from a storage node
await stream.removeFromStorageNode(STREAMR_STORAGE_NODE_GERMANY);

// fetch the storage nodes for a stream
const storageNodes = stream.getStorageNodes();
```

## Working with Lit Protocol

To enable Lit, add this encryption object to the Streamr client constructor:

```ts
new StreamrClient({
  // ...
  encryption: {
    litProtocolEnabled: true,
    litProtocolLogging: false,
  },
});
```

As the Streamr Network deals with real-time messages, publishers are often constantly online. However, it may happen that the publisher has disappeared since publishing the data, making those messages inaccessible to subscribers who have yet to receive the key. This is a consequence of the data publisher being in full control of who can access their data on the Network. If this liveness requirement is disruptive to your use case, there is an opportunity to connect with the Lit protocol.

The [Lit Protocol](https://litprotocol.com) is a decentralized key management network powered by threshold cryptography. The Streamr JS client can be configured to use Lit to manage stream key management.

:::info Good to know:

- Lit must be enabled for both the publisher(s) and subscriber(s)
- Enabling and using Lit is a client constructor parameter. It is not specific to any stream.
- If Lit fails for any reason, the client will fallback to the native Streamr key exchange mechanism.

:::

## Request historical messages

:::caution Important:
In order to fetch historical messages the stream needs to have **[storage enabled](./store-and-retrieve#enable-storage)**.
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
sub.once('resendComplete', () => {
  console.log(
    'Received all requested historical messages! Now switching to real time!'
  );
});
```

Note that only one of the resend options can be used for a particular subscription.
