---
sidebar_position: 3
---

# End-to-end encryption
Confidentiality of events published on a stream can be guaranteed with end-to-end encryption. The publisher generates a AES-256 symmetric encryption key and encrypts the messages before publishing them to the network. As the publisher fully controls who can access their data, they are also responsible for communicating the key to subscribers - usually via the key exchange mechanism described below.

The following algorithms are currently available:
- Message encryption: AES-256
- Key exchange: RSA (default), ML-KEM (experimental)

## Key exchange
The subscribers need the symmetric group key in order to decrypt the data. They automatically obtain this key by performing a key exchange with the publisher. The key exchange happens using asymmetric encryption:

-   Both the publisher and subscriber generate a temporary asymmetric key pair (RSA or ML-KEM, depending on configuration) to be used for the key exchange
-   The subscriber sends a key request to the publisher, containing the subscriber's public key, signed with the subscriber's Ethereum key
-   The publisher checks from the on-chain access control registry whether that subscriber should be able to access the stream, and if it does, the publisher responds by encrypting the AES symmetric key required to unlock the data. The key is encrypted with the publisher's temporary private key for the subscriber's temporary public key, and signed with the publisher's Ethereum key.

## Quantum security
As an experimental feature, Streamr Network allows quantum resistant cryptographic algorithms to be used instead of traditional ones where applicable. Here's an overview of supported algorithms with commentary from the quantum security point of view:
- Data encryption: AES-256 (quantum resistant, used by default)
- Key exchange: ML-KEM-1024 (quantum resistant, available via config option), RSA (not quantum resistant, currently used by default)
- Signatures: ECDSA with secp256k1 curve (not quantum resistant, used by default). Quantum resistant alternatives coming soon

## Quantum resistant key exchange
The ML-KEM-1024 based key exchange works as follows. As ML-KEM can only be used to generate a shared secret between the publisher and subscriber, by itself it's not sufficient to allow an arbitrary key to be transferred from the publisher to a subscriber. Therefore, the ML-KEM shared secret is used to derive an AES-256 'wrapper' key using HKDF. The wrapper key is obtained by both the publisher and subscriber by repeating the same key derivation starting with the shared secret. The wrapper key is used to encrypt and decrypt the actual data encryption key, which is the key being exchanged. All algorithms involved in this procedure are considered quantum resistant, therefore making the entirety of the key exchange quantum resistant.

To start using the ML-KEM based key exchange, pass the following configuration to `StreamrClient` on *subscribers*:

```
const streamr = new StreamrClient({
    encryption: {
        requireQuantumResistantKeyExchange: true
    },
    // ...
})
```

Publishers will automatically respond to key requests based on what algorithm the subscriber requests, so configuring publishers with the above is not necessary. However, if you do set the above config on publishers, they will *only* respond to key requests using ML-KEM, and will ignore requests for RSA. Note that both publishers and subscribers need to have a recent version of the Streamr libraries to use the quantum secure key exchange.

## Publisher liveness
To perform the key exchange with the subscribers, the publisher must be online and present in the Network. As the Streamr Network deals with real-time messages, publishers are often constantly online. However, it may happen that the publisher has disappeared since publishing the data, making those messages inaccessible to subscribers who have yet to receive the key. This is a consequence of the data publisher being in full control of who can access their data on the Network.

## Key rotation and re-key
The AES key need not stay the same over time. There are two operations which the publisher can trigger to change the key:

**Rotate**: provides _forward secrecy_, which means that new subscribers can not automatically access old messages that were published prior to the key rotation. The publisher generates a new AES symmetric key, encrypts it with the old key, and publishes it on the stream. Rotating the key is a fast operation that can be done quite frequently if desired for the use case.

**Re-key**: is needed to revoke a subscriber's access to the stream. The publisher generates a new key and sends it (proactively or via the key exchange) to everyone else except the parties to be removed. Therefore re-keying is a more heavyweight operation than key rotation.

## The Streamr SDK
The [Streamr SDK](https://www.npmjs.com/package/@streamr/node) library automatically encrypts messages published to non-public streams. Messages published to public streams are not encrypted, as it would be unnecessary. The library fully supports the automatic key exchange, and also provides methods for key rotation and re-key.
