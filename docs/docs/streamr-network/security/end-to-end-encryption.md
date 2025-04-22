---
sidebar_position: 2
---

# End-to-end encryption

The Streamr Network ensures confidentiality of messages published to private streams through end-to-end encryption. This approach gives full control of data access to the publisher, who encrypts messages using a symmetric key, and shares the key with authorized subscribers via a secure key exchange.

Streamr currently supports the following algorithms:
- Message encryption: AES-256
- Key exchange: RSA, ML-KEM-1024

## How to use encryption

Messages published to non-public (private) streams are automatically encrypted. The encryption and decryption processes are fully managed by the Streamr SDK, meaning that, in most use cases, you don't need to handle encryption keys manually.

For public streams, encryption is skipped since confidentiality is not required.

## Key Exchange

To decrypt data, subscribers need the correct symmetric key. The key exchange mechanism handles this process automatically using asymmetric encryption.

The process works as follows:
1. Both publisher and subscriber generate temporary asymmetric key pairs (RSA or ML-KEM).
2. The subscriber sends a key request signed with their [identity keys](signing-and-verification.md).
3. The publisher verifies that the subscriber has the `subscribe` permission for this stream in the on-chain access control registry.
4. If verified, the publisher encrypts the symmetric key using its own private key and the subscriber’s public key, and signs it with their [identity keys](signing-and-verification.md).

## Quantum resistant key exchange

Key exchange is just one part of overall quantum security in Streamr. For an overview, see [Quantum security](./quantum-security.md).

Subscribers configured with quantum-resistant [identity keys](signing-and-verification.md) automatically use ML-KEM-1024 to perform a quantum secure key exchange. Publishers respond based on the subscriber’s request. Optionally, you can configure publishers or subscribers to *only* allow quantum resistant key exchange:

```
const streamr = new StreamrClient({
    encryption: {
        requireQuantumResistantKeyExchange: true
    },
    // ...
})
```

ML-KEM-1024 allows a secure exchange of keys resistant to quantum attacks. However, ML-KEM only establishes a shared secret — it does not allow direct transfer of a key. Here's how ML-KEM is combined with other algorithms to encrypt the key:

1. The shared secret from ML-KEM is used with HKDF to derive an AES-256 wrapper key.
2. This wrapper key is used to encrypt/decrypt the actual data encryption key.

All cryptographic steps in this process are quantum resistant.

## Publisher liveness

For key exchange to succeed, the publisher must be online. If a subscriber joins after the publisher goes offline, they may not be able to decrypt earlier messages.

Publishers store previously used keys locally. This enables historical decryption, as long as the publisher is available to respond to key requests. Subscribers also store locally previously used keys, reducing the need for new key exchanges when the same key continues to be used.

## Typical key management workflow

- The publisher generates a new key at the start of publishing, or looks up a previously used one from the local key store.
- The key remains active unless explicitly rotated or re-keyed.
- Subscribers can request the current key, and possibly previous keys (for historical data).
- Periodic key rotation or targeted re-keying ensures access control and confidentiality, see below.

## Key rotation and re-key

The Streamr SDK automatically encrypts messages and handles key exchange, but does not automatically rotate or re-key. The application may trigger these operations as needed:

**Rotate**: provides _forward secrecy_, which means that new subscribers can not automatically access old messages that were published prior to the key rotation. Upon a rotation, the publisher generates a new symmetric key, encrypts it with the old key, and publishes it on the stream. Rotating the key is a fast operation that can be done frequently if desired for the use case, for example once per hour on a timer. A key rotation is performed as follows:

```ts
streamr.updateEncryptionKey({
  streamId,
  distributionMethod: 'rotate',
});
```

**Re-key**: is needed to discontinue one or more subscribers' access to the stream after their `subscribe` permissions have been revoked or expired. Upon a re-key, the publisher generates a new symmetric key and sends it (proactively or via the key exchange) to everyone else except the revoked subscribers. Therefore re-keying is a more heavyweight operation than key rotation. If the stream has a large number of subscribers with frequent revocation or expiration of permissions, it's advisable to batch revoke permissions and do a single re-key, instead of doing a re-key after every individual revocation.

```ts
streamr.updateEncryptionKey({
  streamId,
  distributionMethod: 'rekey',
});
```

## Pre-agreed keys

If you don't want to exchange the keys via the network, you can pre-configure symmetric keys on both publishers and subscribers like this:

```ts
// Generates a new AES-256 key (32 random bytes)
const key = new GroupKey('key-id', crypto.randomBytes(32))

// Set the key on a publisher
publisher.updateEncryptionKey({
  key,
  streamId,
  distibutionMethod: 'rekey',
})

// Set the key on a subscriber
subscriber.addEncryptionKey(key, streamId)
```
