---
sidebar_position: 1
---

# Data signing and verification
Authenticity and integrity of events published on a stream is guaranteed with digital signatures. All messages published to streams are cryptographically signed, which prevents tampering of messages and allows recipients to validate the message's publisher.

Every message published to a stream has six fields that uniquely identify this message across time, all streams and all publishers:

-   `streamId`
-   `streamPartititon`
-   `timestamp`
-   `sequenceNumber`
-   `publisherId`
-   `msgChainId`

<!-- TODO - bring in the Protocol specification -->
More details about these fields can be found in the <a href="https://github.com/streamr-dev/streamr-specs/blob/master/PROTOCOL.md" target="_blank" rel="noopener noreferrer">protocol specification</a>. All together they form the message ID. They must be signed along with the actual message content to resist against replay attacks. So the payload to be signed for every message by every publisher is the following.

```
payload = streamId + streamPartition + timestamp + sequenceNumber + publisherId + msgChaindId + content
```

The signing algorithm follows the convention described <a href="https://github.com/ethereum/EIPs/blob/master/EIPS/eip-712.md" target="_blank" rel="noopener noreferrer">here</a>. The secp256k1 ECDSA algorithm is applied on the keccak256 hash of a string derived from the challenge text.

```
signature = sign(keccak256("\x19Ethereum Signed Message:\\n" + len(payload) + payload)))
```

The recipients of a message validate the signatures to ensure integrity and authenticity of the messages. The signature verification is done in three steps:

1. The subscriber extracts from the event and the signature the Ethereum address that signed the message (using the EC recover operation).
2. Check that the address recovered in step 1 matches the address defined by `publisherId`.
3. Check that this `publisherId` belongs to the set of valid publishers by referencing the on-chain access control registry.
