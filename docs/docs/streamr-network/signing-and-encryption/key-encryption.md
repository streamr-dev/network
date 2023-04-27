---
sidebar_position: 2
---

# Key encryption

Messages published to a non-public (i.e. private) stream are always encrypted. The publishing client creates the encryption keys and delivers them to the subscribers automatically. In most use cases, there is no need to manage encryption keys manually.

## Typical use cases

A new encryption key is generated when publishing activity to a stream starts. The keys don't change during the lifetime of a client unless explicitly updated.

At any given time a subscriber can request a key from a publisher. When the publisher receives a request, it checks whether the subscriber has valid `StreamPermission.SUBSCRIBE` permission to the stream. If a valid permission exists, the client sends the encryption key to the subscriber. The subscriber can then use the key to decrypt messages which are encrypted with that key.

Typically subscribers query the current encryption key. But if they need to access to historical data, they may query previous encryption keys. A publisher client keeps track of all previous encryption keys in a local database, so it can respond to historical encryption key queries automatically. Therefore the publisher needs to stay online if historical decryption of its data is something that should be supported.

## Manual key update

You can manually update the encryption key by calling `client.updateEncryptionKey(...)`. This triggers the creation of a new encryption key, after which the client starts to use that to encrypt published messages.

In practice, an update is needed if:

- You want to prevent new subscribers from reading historical messages. When you update the key, the new subscribers get the new key. But as the historical data is encrypted with some previous key, those messages aren't decryptable by the new subscribers.
- You want to prevent expired subscribers from reading new messages. When you update the key, but you don't distribute the new key to the expired subscribers, they aren't able to decrypt new messages.

Both of the use cases are covered if you call:

```ts
client.updateEncryptionKey({
  streamId,
  distributionMethod: 'rekey',
});
```

You may want to call this method regularly (e.g. daily/weekly). Alternatively you can call it anytime you observe new expired subscribers (that is, someone bought your stream for a limited period of time, and that period has now elapsed).

## Optimization: key rotation

You can optimize the key distribution by using `rotate` instead of `rekey`. The optimization is applicable if subscriptions haven't expired or been removed. In that situation you can update the key by calling:

```ts
client.updateEncryptionKey({
  streamId,
  distributionMethod: 'rotate',
});
```

In detail, the difference between the methods is:

- In `rekey` method, the client sends the new key individually to each subscriber. Every subscriber receives a separate message which is encrypted with their public RSA key. The `StreamPermission.SUBSCRIBE` permission is checked by the publisher for each subscriber before a key is sent.
- In optimized `rotate` method, the key is broadcasted to the network in the metadata of the next message. The key is encrypted with the previous encryption key and therefore subscribers can use it only if they know the previous key (https://en.wikipedia.org/wiki/Forward_secrecy). As the key is broadcasted to everyone, no permissions are checked. Note that recently expired subscribers most likely have the previous key, therefore they can use that new key, too.

## Pre-agreed keys

If you don't want to exchange the keys via the network, you can use pre-agreed keys like this:

```ts
const key = new GroupKey('key-id', crypto.randomBytes(32));
publisher.updateEncryptionKey({
  key,
  streamId,
  distibutionMethod: 'rekey',
});
subscriber.addEncryptionKey(key, streamId);
```

## Configuration

There are two optional configuration options related to encryption keys:

- `decryption.keyRequestTimeout`: max time (in milliseconds) to wait before a key request timeouts
- `decryption.maxKeyRequestsPerSecond`: max count of key request to be sent within a second (i.e. it throttles the requests if it receives messages from many new publishers within a short period of time)

## Lit protocol

[Lit Protocol](https://litprotocol.com) is a decentralized key management network powered by threshold cryptography. Streamr can be configured to use Lit to manage stream key management. See the [store and retrieve data](../../usage/streams/store-and-retrieve) section for more information on combining Lit with Streamr.

The client uses the Streamr Network's key-exchange by default. There is also experimental support for [Lit Protocol](https://litprotocol.com/). If you want to enable it, set `encryption.litProtocolEnabled` config option to `true`. 
When Lit Protocol is enabled, it is used as a primary encryption key store. The Streamr Network's key-exchange is still used as a fallback.
For the Streamr Network's key-exchange you can use these config options to control the decryption process:
- `encryption.keyRequestTimeout`: max time (in milliseconds) to wait before a key request timeouts
- `encryption.maxKeyRequestsPerSecond`: max count of key request to be sent within a second (i.e. it throttles the requests if it receives messages from many new publishers within a short period of time)
