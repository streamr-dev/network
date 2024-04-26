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

For more in depth analysis, see [Security - Data signing & verification](../../streamr-network/security/signing-and-verification.md).

## Smart contract pub/sub (ERC-1271)
Beside the typical externally owned account signing and verification, the Streamr protocol also supports smart contract signature verification, i.e. ERC1271 support. This feature allows the use of smart contracts that follow the ERC1271 spec to become signatories on streams in the Streamr Network.

:::info Key points:
- This feature is enabled on a per stream basis.
- Ensure the EIP-1271 contract address provided in the stream configuration is valid and compliant with the EIP-1271 specification.
- Only elliptic curve, secp256k1 cryptography is supported.
- Smart contract signature validation is periodically [cached](#optimizations-and-caching).
:::

Every message (data point) on Streamr must be signed with the private key of the publisher and these messages are validated on every hop inside the network by Streamr nodes. With externally owned accounts (EOAs) the Streamr SDK uses `ecrecover` in this process (to verify the public key of the signed message). If the stream has enabled ERC1271 support, the verification will be done through the assigned smart contract with a call to the function `isValidSignature`.

Read more on the [EIP-1271 standard](https://www.dynamic.xyz/blog/eip-1271#:~:text=By%20implementing%20the%20isValidSignature%20function,wallets%20and%20social%20recovery%20wallets)

### Example usage
```ts
const streamr = new StreamrClient({
  auth: {
    privateKey: '<REDACTED>'
  }
})

/* 
  Behind the scenes a call to contract method `isValidSignature` is performed to verify that 
  the client wallet address is a valid signer for the given contract.
*/
await streamr.publish('foobar.eth/hello/world', {
   key: 'value'
}, {
  erc1271contract: '0xc0ffee254729296a45a3885639AC7E10F9d54979' 
})

await streamr.subscribe({
    streamId,
    erc1271Contract: '0xc0ffee254729296a45a3885639AC7E10F9d54979'
}, (msg) => {
    console.log(msg)
})
```

### Signature caching
To optimize performance and reduce RPC calls, a caching mechanism is implemented in the signature validation process. This is set to 10 minutes.