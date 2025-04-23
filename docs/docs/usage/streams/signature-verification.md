---
sidebar_position: 9
---

# Signature verification
Authenticity and integrity of events published on a stream is guaranteed with digital signatures. All messages published to streams are cryptographically signed, which prevents tampering of messages and allows recipients to validate the message's publisher.

:::info Practicalities
- In the browser, every published message will typically need to be manually signed by metamask. 
- When viewing a private (encrypted) stream in the browser, Metamask may ask for your signature. This is to verify that you are in the authorised set of the stream's subscribers.
- Signing is instrumental to the protocol and cannot be turned off. 
:::

For more in depth analysis, see [Security - Identity and signatures](../../streamr-network/security/signing-and-verification.md).

## Smart contract pub/sub (ERC-1271)
Beside the typical externally owned account signing and verification, the Streamr protocol also supports smart contract signature verification, i.e. ERC1271 support. This feature allows the use of smart contracts that follow the ERC1271 spec to become signatories on streams in the Streamr Network.

:::info Key points:
- This feature is enabled on a **per stream** basis and activated on a **per sesssion** basis.
- Ensure the EIP-1271 contract address provided in the stream configuration is valid and compliant with the EIP-1271 specification.
- Only elliptic curve, secp256k1 cryptography is supported.
- Smart contract signature validation is periodically [cached](#optimizations-and-caching).
:::

Every message (data point) on Streamr must be signed with the private key of the publisher and these messages are validated on every hop inside the network by Streamr nodes. With externally owned accounts (EOAs) the Streamr SDK uses `ecrecover` in this process (to verify the public key of the signed message). If the stream has enabled ERC1271 support, the verification will be done through the assigned smart contract with a call to the function `isValidSignature`.

Read more on the [EIP-1271 standard](https://www.dynamic.xyz/blog/eip-1271#:~:text=By%20implementing%20the%20isValidSignature%20function,wallets%20and%20social%20recovery%20wallets)

### Example usage
To make use of this feature, you'll first need to have the address of an EIP-1271 compatible smart contract. 

Create a stream on Streamr or use an existing one. Grant publish or subscribe permission to the ERC-1271 smart contract address, then publish or subscribe to the stream using the Streamr SDK and the `erc1271Contract` session configuration. 

Streams that include ERC-1271 smart contracts in their access control can be published and subscribed to with **both** EOAs and Smart contracts, with the latter requiring the publish/subscribe session configuration, as shown in the code example below.

```ts
const streamr = new StreamrClient({
  auth: {
    privateKey: '<REDACTED>'
  }
})

const streamId = 'foobar.eth/hello/world'

/* 
  Behind the scenes a call to contract method `isValidSignature` is performed to verify that 
  the client wallet address is a valid signer for the given contract.
*/
await streamr.publish(streamId, {
   key: 'value'
}, {
  erc1271contract: '0xc194631194671a44a9ef1c59df290ef0f3e76ea1' 
})

await streamr.subscribe({
    streamId,
    erc1271Contract: '0xc194631194671a44a9ef1c59df290ef0f3e76ea1'
}, (msg) => {
    console.log(msg)
})
```

### Ecosystem example
[DIMO](https://dimo.zone) uses this feature as part of the on-chain [Developer License](https://docs.dimo.zone/developer-platform/getting-started/developer-tools/developer-license). Here is an [example contract](https://polygonscan.com/address/0xc194631194671a44a9ef1c59df290ef0f3e76ea1#readContract) that can be observed for testing.

### Signature caching
To optimize performance and reduce RPC calls, a caching mechanism is implemented in the signature validation process. This is set to 10 minutes.