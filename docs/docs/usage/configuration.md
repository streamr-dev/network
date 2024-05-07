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