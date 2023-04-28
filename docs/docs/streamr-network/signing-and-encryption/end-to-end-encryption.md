---
sidebar_position: 3
---

# End-to-end encryption
Confidentiality of events published on a stream can be guaranteed with end-to-end encryption. The publisher generates a AES-256 symmetric encryption key and encrypts the messages before publishing them to the network. As the publisher fully controls who can access their data, they are also responsible for communicating the key to subscribers - usually via the key exchange mechanism described below.

## Key exchange
The subscribers need the symmetric group key in order to decrypt the data. They automatically obtain this key by performing a key exchange with the publisher. The key exchange happens using asymmetric encryption:

-   Both the publisher and subscriber generate a temporary RSA key pair to be used for the key exchange
-   The subscriber sends a key request to the publisher, containing the subscriber's public key, signed with the subscriber's Ethereum key
-   The publisher checks from the on-chain access control registry whether that subscriber should be able to access the stream, and if it does, the publisher responds with the AES symmetric key, encrypted with the publisher's RSA key for the subscriber's RSA key, and signs with the publisher's Ethereum key.

## Publisher liveness
To perform the key exchange with the subscribers, the publisher must be online and present in the Network. As the Streamr Network deals with real-time messages, publishers are often constantly online. However, it may happen that the publisher has disappeared since publishing the data, making those messages inaccessible to subscribers who have yet to receive the key. This is a consequence of the data publisher being in full control of who can access their data on the Network.

## Key rotation and re-key
The AES key need not stay the same over time. There are two operations which the publisher can trigger to change the key:

**Rotate**: provides _forward secrecy_, which means that new subscribers can not automatically access old messages that were published prior to the key rotation. The publisher generates a new AES symmetric key, encrypts it with the old key, and publishes it on the stream. Rotating the key is a fast operation that can be done quite frequently if desired for the use case.

**Re-key**: is needed to revoke a subscriber's access to the stream. The publisher generates a new key and sends it (proactively or via the key exchange) to everyone else except the parties to be removed. Therefore re-keying is a more heavyweight operation than key rotation.

## The JS client library
The [Streamr JS client](https://www.npmjs.com/package/streamr-client) library automatically encrypts messages published to non-public streams. Messages published to public streams are not encrypted, as it would be unnecessary. The library fully supports the automatic key exchange, and also provides methods for key rotation and re-key.
