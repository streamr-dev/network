---
sidebar_position: 1
---

# Identity and signatures

The publisher's digital signature is attached to all data published on Streamr. Those signatures are automatically validated by subscribers to establish the authenticity and integrity of data in order to prevent spoofing and tampering of data. 

The type of cryptographic keys configured on the publisher determine the signature algorithm to be used. This is an in-depth article about identity and signatures - for the basics on identities and how to configure them on the Streamr SDK, see [Identity](../../usage/identity.md). If you're looking for information about encryption and data confidentiality, see [End-to-end encryption](end-to-end-encryption.md).

## Supported key types

The Streamr SDK is configured with cryptographic keys which determine the user's identity in the network. The type of keys used also determines the signature algorithm used. The Streamr SDK supports the following key/identity/signature schemes:

- ECDSA with the `secp256k1` curve - commonly referred to in Streamr context as an 'Ethereum' identity, defined by a private key and an 'address' derived from the related public key. This is the default and most commonly used identity type, and the only one capable of signing transactions on EVM blockchains.
- ML-DSA for quantum resistant signatures. Learn more about [Quantum Security](quantum-security.md).

The choice of keys and algorithms depends on the use case and whether the same identities are used outside of Streamr. The following table specifies the functionality available to each key type as well as the `keyType` and `Identity` class name required to use it:

| Key Type               | Identity Implementation  | Pub/Sub | Stream Management | Quantum Resistance |
|------------------------|--------------------------|---------|-------------------|--------------------|
| ECDSA_SECP256K1_EVM    | EthereumKeyPairIdentity  | ✅      | ✅                | ❌                 |
| ML_DSA_87              | MLDSAKeyPairIdentity     | ✅      | ❌                | ✅                 |

The meaning of the columns above are as follows:

- `keyType`: the value to be passed to the SDK, node, or CLI tool to specify the key type. The default value is `ECDSA_SECP256K1_EVM`. Examples:

```
// Passing to StreamrClient:
const streamr = new StreamrClient({
    auth: {
        publicKey: '...',  // hex encoded public key
        privateKey: '...', // hex encoded private key
        keyType: '...'     // keyType from the above table
    }
})

// Similarly, in a Streamr JSON config file for a node or CLI tool:
{
    "client": {
        "auth": {
            "publicKey": "...",
            "privateKey": "...",
            "keyType": "...",
        }
    }
}

// As a command-line option to the CLI tool:
streamr identity generate --key-type ML_DSA_87
```

- `Identity`: the name of the class that wraps the key pair and provides a signing function. An instance of the `Identity` subclass can be passed to the `StreamrClient` constructor. The class can also be used to generate new key pairs. Examples:

```
import { StreamrClient, EthereumKeyPairIdentity } from '@streamr/sdk'

// Generate a new identity
const identity = EthereumKeyPairIdentity.generate()

// You can pass an identity implementation to StreamrClient
const streamr = new StreamrClient({
  auth: {
    identity,
  },
})
```

- `Pub/Sub`: the keys can be used to publish and subscribe to data on the Streamr Network, and associated permissions can be assigned to the key.
- `Stream management`: the keys can be used for smart contract interactions to create streams, set stream permissions, etc.
- `Quantum resistance`: the identity and signatures from this key type are considered resistant to attacks by quantum computers. Read more about [Quantum security](quantum-security.md).

## What exactly is signed? 

In Streamr, the message content as well as metadata of the message are protected by signatures by including them in the payload to be signed. The specific contents of the signed payloads are:

- The stream ID and partition
- Message timestamp
- Message sequence number
- The message publisher's ID (public key)
- Message chain ID
- Message content

Including all of the above fields in the signed data not only ensures that the message contents can not be tampered, but also that messages can not be spoofed across different streams, their timestamps can not be altered, or the order of messages from a publisher can not be manipulated.

## Message validation

Subscribers validate the messages they see in a stream as follows:

1. They validate that the cryptographic signature on the message is valid for the received message content and message metadata.
2. They validate that the publisher of the message has the `publish` permission in the on-chain access control registry.
3. Only if the above checks succeed, the received message is bubbled up from the SDK to the application using it. Otherwise, an error event is triggered on the subscription.
