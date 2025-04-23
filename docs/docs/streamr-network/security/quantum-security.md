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
        publicKey: '...',  // hex encoded ml-kem-87 public key
        privateKey: '...', // hex encoded ml-kem-87 private key
        keyType: 'ml-dsa-87'
    }
})
```

## Generating ML-DSA keys

To generate ML-DSA keys, see `MLDSAKeyPair.generate()` or use CLI tool:

```
streamr keys generate --key-type ml-dsa-87
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
