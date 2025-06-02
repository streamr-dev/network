---
sidebar_position: 3
---

# Quantum security

Streamr supports quantum resistant algorithms for both [identity & signatures](signing-and-verification.md) as well as [encryption & key exchange](end-to-end-encryption.md). With appropriate configuration, it's possible to use only quantum resistant algorithms with Streamr. In a quantum resistant configuration, Streamr uses:

- ML-DSA for identity and signatures
- ML-KEM + HKDF + AES-256 for key exchange
- AES-256 for data encryption

## Activating quantum security

To activate the whole quantum secure stack, simply configure ML-DSA identities on your publishers and subscribers, and the rest happens automatically:

```
const streamr = new StreamrClient({
    auth: {
        publicKey: '...',  // hex encoded ML-DSA-87 public key
        privateKey: '...', // hex encoded ML-DSA-87 private key
        keyType: 'ML_DSA_87'
    }
})
```

## Generating ML-DSA keys

You can generate the ML-DSA-87 keys using a suitable tool or library of your choice, or use tooling available on Streamr. For example, using the Streamr CLI tool:

```
streamr identity generate --key-type ML_DSA_87
```

Or programmatically using the `MLDSAKeyPairIdentity` class that ships with the Streamr SDK:

```
const identity = MLDSAKeyPairIdentity.generate()
const publicKey = await identity.getUserId()
const privateKey = await identity.getPrivateKey()
```

## Enforcing quantum security

In order to tighten up the quantum security and refuse the use of any non-quantum algorithms, you may additionally set the following configuration:

```
const streamr = new StreamrClient({
    auth: ..., // as per above
    encryption: {
        requireQuantumResistantKeyExchange: true,
        requireQuantumResistantSignatures: true,
        requireQuantumResistantEncryption: true
    }
})
```

## Performance considerations

Note that the quantum resistant algorithms require much more intensive computation than the traditional algorithms. In Streamr, each message is signed at the publisher and validated on each subscriber. In streams with very frequent messages, this may create a bottleneck. For rough ballpark numbers, on an Apple M2 laptop, computing an ML-DSA-87 signature takes roughly 12ms and verification takes 4ms.
