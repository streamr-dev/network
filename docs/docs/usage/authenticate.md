---
sidebar_position: 1
---

# Authenticate

In Streamr, Ethereum accounts are used for identity. You can generate an Ethereum private key using any Ethereum wallet, or you can use the utility function `StreamrClient.generateEthereumAccount()`, which returns the address and private key of a fresh Ethereum account. A private key is not required if you are only subscribing to public streams on the Network.

```ts
const streamr = new StreamrClient({
  auth: {
    privateKey: 'your-private-key',
  },
});
```

Authenticating with an Ethereum private key contained in an Ethereum (web3) provider, e.g. MetaMask:

```ts
const streamr = new StreamrClient({
  auth: {
    ethereum: window.ethereum,
  },
});
```

You can also create an anonymous client instance that can interact with public streams:

```ts
const streamr = new StreamrClient();
```

Streamr supports ENS names to allow streams to have human readable names, for example `mydomain.eth/traffic/helsinki`. More on that in the [Streams section](./streams/creating-streams).

## Generate Ethereum account

The Streamr client offers a convenience static function `StreamrClient.generateEthereumAccount()` which will generate a new Ethereum private key and returns an object with fields `address` and `privateKey`.

```ts
const { address, privateKey } = StreamrClient.generateEthereumAccount();
```

In order to retrieve the client's address an async call must me made to `streamr.getAddress`

```ts
const address = await streamr.getAddress();
```
