---
sidebar_position: 6
---

# Streamr config
Whether you're developing an application in the browser, in NodeJS, or any other development environment, there will often be a need to configure the Streamr Node, or Streamr SDK to match your use case. Configuration changes are made through either the [Streamr SDK constructor](./configuration.md#the-streamr-sdk-constructor), or the [Streamr config file](./configuration.md#the-node-config-file).

## The Streamr SDK constructor
For the full list of parameter options, see:
- [TypeScript generation file](https://github.com/streamr-dev/network/blob/main/packages/client/src/Config.ts)

```ts
const streamr = new Streamr({
    auth: {
        privateKey: "ethereum-private-key",
    },
    // ... more configuration
})
```

## The Streamr Node config file
The config file, typically located at `.streamr/config/default.json` or `~/.streamrDocker/config/default.json`, as the name indicates, contains the configuration of the Streamr node. The main part of this config is the [`client`](https://github.com/streamr-dev/network/blob/main/packages/client/src/Config.ts) section. The reamining configuration options of the Streamr node (Broker) config can be discovered from the [broker config schema](https://github.com/streamr-dev/network/blob/main/packages/broker/src/config/config.schema.json). For example, Node plugins are configured here.

## The Streamr config package
Not to be confused with the internal Streamr package configurations such as the client and broker, the Network configuration contains mainly "Network level" parameters that are sometimes useful to read from, depending on your use case. The Streamr Network and Streamr apps reference an NPM package containing the [Streamr config package](https://www.npmjs.com/package/@streamr/config). The config package helps resolve the network level configuration that contains contract addresses, entry point addresses, etc: 
- [Network default configuration](https://github.com/streamr-dev/network-contracts/blob/master/packages/config/src/index.ts)

This package is regularly updated, for example when a new chain is supported, or a smart contract is upgraded. 

```ts
import { config } from "@streamr/config"

const {
    ethereum: {
        id: chainId,
        contracts: {
            "DATA": dataTokenAddress
        }
    }
} = config
```

## Chain configuration
The Streamr Network is an off-chain data network that can be combined with any EVM compatible blockchain. The Streamr "Mainnet" is coupled to the Polygon POS blockchain. Streamr has also deployed its infrastructure to the [Polygon Amoy Testnet](#polygon-amoy-testnet).

To be clear,
- Streams are created on a chain (default chain is Polygon POS)
- To subscribe to a stream, you must have the Streamr SDK or Streamr node configured to the chain that the stream is on.

### Polygon Amoy Testnet
To switch chains, use the `environment` parameter. The default is `polygon`, which maps to the Polygon POS blockchain. To switch to the Polygon Amoy Testnet, follow these code snippets:

**Streamr SDK:**
```ts
const streamr = new StreamrClient({
    auth: {
        privateKey: PRIVATE 
    },
    environment: "polygonAmoy",
})
```

**Streamr node**
```json
{
    "client": {
        "auth": {
            "privateKey": "PRIVATE"
        },
        "environment": “polygonAmoy”
    },
    "plugins": {
        ...
    }
}
```

## Blockchain RPC configuration
The Streamr Network continuously communicates with a blockchain selected by the user, with the Polygon POS blockchain being the default choice. To facilitate this communication, the Streamr Node and Streamr SDK are configured with public RPC endpoints. Although Streamr ensures robust redundancy, these third-party dependencies may experience downtime. Therefore, you might prefer to use your own RPC provider. 

Here’s how to set it up:

In the case of updating your Streamr node, add this section to your Streamr node config file,
```json
{
    "client": {
        ...
        "contracts": {
            "ethereumNetwork": {
                "chainId": 137
                ...
            },
            "rpcs": [ ... ]
        }
    ...
```

In the case of updating your Streamr app which uses the Streamr SDK, add this section to the Client constructor,

```ts
const streamr = new StreamrClient({
...
    contracts: {
        ethereumNetwork: {
            chainId: 137
            ...
        },
        rpcs: [ ... ]
    }
...
})
```

Where the `137` chainId refers to [Polygon POS](https://chainlist.org/).

Example RPC section:
```
rpcs: [{
    url: "https://polygon-rpc.com",
  },
  {
    url: "https://polygon-bor.publicnode.com",
  }],
```

Note, this RPC config schema applies to Streamr node and SDK versions `100.2.5` and above.
