---
sidebar_position: 0
---

# Identity

In Streamr, cryptographic keys are used to establish secure identity. The keys are used to sign data when interacting with the Network, for example signing messages when publishing them to a stream, or signing on-chain transactions when creating or managing a stream. Access control works by assigning verifiable [permissions](../usage/streams/permissions) to these identities.

The most common type of key pair used with Streamr is an Ethereum-compatible key pair/wallet. Other types of keys and related signature algorithms are supported as well, including quantum resistant ones. Learn more about [cryptographic identities and signatures](../streamr-network/security/signing-and-verification.md).

## Configuring Streamr with an Ethereum private key

You can configure the Streamr SDK with an Ethereum private key as follows:

```ts
const streamr = new StreamrClient({
  auth: {
    privateKey: 'your-ethereum-private-key',
  },
})
```

Or, if you're using a config file:

```
{
  "client": {
    "auth": {
      "privateKey": "your-ethereum-private-key"
    }
  }
}
```

## Connecting to an Ethereum wallet

You can connect the Streamr SDK to an Ethereum wallet such as MetaMask to use the keys therein. To accomplish this, pass the Ethereum (web3) provider instance:

```ts
const streamr = new StreamrClient({
  auth: {
    ethereum: window.ethereum,
  },
});
```

## Configuring Streamr without an identity

If you only intend to interact with a public stream, there's no need to configure a specific cryptographic identity:

```ts
const streamr = new StreamrClient()
```

Under the hood, this generates a random Ethereum identity under the hood.

## Generating an Ethereum identity

You can generate an Ethereum private key using any Ethereum wallet (such as MetaMask) or library (such as ethers). The Streamr SDK also provides a method to generate an Ethereum identity:

```
import { StreamrClient, EthereumKeyPairIdentity } from '@streamr/sdk'

// Generate new identity
const identity = EthereumKeyPairIdentity.generate()

// Log private key and associated identifier (in this case, Ethereum address) to console
identity.getUserId().then(address => console.log(`Address: ${address}`))
identity.getPrivateKey().then(key => console.log(`Private key: ${key}`))

// You can also pass the identity implementation to StreamrClient
const streamr = new StreamrClient({
  auth: {
    identity,
  },
})
```

## Configuring other types of key pairs

For publishing and subscribing to data, other types of key pairs and signature algorithms are supported, including quantum resistant ones. They can be configured by passing the `publicKey` and `privateKey` as hex encoded strings, and specifying a `keyType` selector. See [Identity and Signatures](../streamr-network/security/signing-and-verification.md) for a list of supported key types and signature algorithms and how to use them.
