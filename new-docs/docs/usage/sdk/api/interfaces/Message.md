# Interface: Message

Represents a message in the Streamr Network.

## Properties

### content

> **content**: `unknown`

The message contents / payload. Given as JSON or Uint8Array

***

### groupKeyId

> **groupKeyId**: `undefined` \| `string`

Identifiers group key used to encrypt the message.

***

### msgChainId

> **msgChainId**: `string`

Identifies the message chain the message was published to.

***

### publisherId

> **publisherId**: `string`

Publisher of message.

***

### sequenceNumber

> **sequenceNumber**: `number`

Tiebreaker used to determine order in the case of multiple messages within a message chain having the same exact timestamp.

***

### signature

> **signature**: `Uint8Array`

Signature of message signed by publisher.

***

### signatureType

> **signatureType**: `"LEGACY_SECP256K1"` \| `"SECP256K1"` \| `"ERC_1271"`

Signature method used to sign message.

***

### streamId

> **streamId**: [`StreamID`](../api.md#streamid)

Identifies the stream the message was published to.

***

### streamPartition

> **streamPartition**: `number`

The partition number the message was published to.

***

### timestamp

> **timestamp**: `number`

The timestamp of when the message was published.
