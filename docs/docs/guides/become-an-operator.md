---
sidebar_position: 5
---

# How to become an Operator
**TL;DR Do these things to become an earning Streamr node Operator:**

- Deploy an Operator smart contract. 
- Run a Streamr node and pair it with your Operator. 
- Stake `DATA` tokens on your Operator and give your nodes some `MATIC`
- Join Sponsorships through your Operator that will earn you DATA tokens.

## Testnet schedule
Checkout the official [Streamr Testnets page](../streamr-testnets/testnets.md) for the latest news and updates related to the incentivized three testnets running over December 2023 and January 2024.

## Migrating from Brubeck
If you’ve been running a Streamr node in the past you might be familiar with a two step process– run some software and stake some tokens, i.e. a software step and a blockchain step. Behind the scenes, the Streamr core team would validate user’s stake and transfer tokens to node runner wallets at the end of each month. This has worked, but it's been highly centralized. With the introduction of stream Sponsorships, Operators, Sponsors and Delegators we now have everything we need for a peer to peer decentralized and market based incentivization on Streamr. The most important role is the Operator, so let's learn how to become one.

:::tip Streamr 1.0 network versus the Brubeck (older) network
- You can run ~~up to 5 nodes per IP address~~ any number of nodes from the same IP address, although one node per machine is recommended
- Rewards are ~~automatically paid out at the beginning of the following month~~ claimed from active Sponsorships at any time
- You can stake ~~up to 20K DATA per node~~ as much as you want. Note that at least 5% of Operator stake must come from the owner, and therefore delegations can not exceed 95%.
- To participate in the testnets, use specific versions/tags of the Streamr node software, such as `v100.0.0-testnet-one.3`. The `latest` tag still points to the previous milestone (Brubeck) software.
- There is no need for a "beneficiary address" in Streamr 1.0. Instead, the node configuration contains the Operator contract address.
:::

## Migrating from Mumbai
If you've created your node in the Mumbai testing environment and you want to participate in the incentivized testnets with real token rewards and risks, then you'll need to recreate your Operator using the Streamr Network [Hub](https://streamr.network/hub). The same funding and pairing steps that you did for your Mumbai Operator need to be repeated here too. The testnets and the future 1.0 mainnet will run on the Polygon Blockchain.

- **Node version:** The `pretestnet` tagged releases shouldn't be used anymore, instead use `v100.0.0-testnet-one.3`. 
- **Node config:** Your node config should resemble the [Testnet 1 config template](#testnet-node-config).

## Operator setup instructions
Follow these steps below to setup your Operator so that you can participate in the protocol and collect rewards. 

### Step 1: Deploy your Operator Contract
In the [Streamr Hub](https://streamr.network/hub), connect your wallet (top-right corner), navigate to Network -> Operators, then click "Become an Operator" and complete the dialog. The [Operator contract](../streamr-network/network-roles/operators.md#the-operator-contract) is deployed on the Polygon blockchain.

The wallet/account that you use to make the Operator creation transaction will be known as the **Owner wallet**. It's the wallet you'll use to control your Operator business. The owner wallet controls the Operator and is able to stake and unstake on Sponsorships, update the Operator settings, and withdraw the owner's share of the Operator's stake and earnings. This should be a very secure wallet as it controls the whole Operator. A hardware wallet (Ledger, etc) is recommended, although a software wallet (Metamask) will work too - just be sure to keep the account private and never share your private key or seed phrase with anyone.

You'll need to decide on your [owner's cut](../streamr-network/network-roles/operators.md#owners-cut) at the time of your Operator deployment. You'll be able to change this value later on, as long as you unstake from all Sponsorships first.

You can also practice your Operator deployment in the Mumbai environment with the [Mumbai Streamr Hub](https://mumbai.streamr.network/hub) (rather than switching networks on the Streamr Hub). You'll need Mumbai `MATIC` - widely available with [public faucets](https://mumbaifaucet.com) and you'll need ` TEST` tokens (the Mumbai network's worthless `DATA` tokens) - There is a `TEST` token faucet on the [Streamr Discord](https://discord.gg/gZAm8P7hK8).

### Step 2: Run a Streamr node
Spin up a Streamr node using this [guide](./how-to-run-streamr-node.md).

Nodes will consume resources, mainly bandwidth and CPU. RAM usage is moderate and disk usage in negligible. 

Running multiple nodes on the same virtual machine (VM) is not in your best interest. The point of running multiple nodes is redundancy as well as load balancing/horizontal scaling, neither of which are really achieved if multiple nodes run on the same VM. Ideally each VM would run on separate physical hardware or geographical location.

While there are no strict hardware recommendations, 8GB of RAM, 3-4 virtual cores, and ideally 1Gbps bandwidth would be a safe bet for participating in most [stream Sponsorships](../streamr-network/incentives/stream-sponsorships.md).

:::caution Important
- A public IP is a must
-  A TCP port for [WebSocket connectivity](./how-to-run-streamr-node#websocket-connectivity) must be open. The port is configurable and the default is 32200.
:::

### Step 3: Pair your node with your Operator contract
To pair your node(s) with your Operator contract, you must make them aware about each other. For this, you need two things:

- Your **Operator address** (found near the top of your Operator page in the Streamr Hub).
- Your **node wallet**, which consists of an Ethereum private key and address. You might already have created one with the config wizard when setting up the node. Alternatively, you can use any method, such as create a new account in Metamask and export the private key, or use [vanity-eth](https://vanity-eth.tk/).

![image](@site/static/img/operator-address.png)

**Add your Operator's node addresses**

First, scroll down on your Operator page and find the "Operator's node addresses" section. Click the "Add node address" button, paste in the **address** of your **node wallet** (not its private key!), click the button in the dialog and then don't forget to click the Save button.

![image](@site/static/img/node-addresses.png)

**Update your node's configuration file**

Then, update your node's config file. Use [this testnet config](#testnet-node-config). Inside this configuration you will need to update:
- Replace `"YOUR_OPERATOR_CONTRACT_ADDRESS"` with your **Operator address** (keep the quotes).
- Replace `"NODE_PRIVATE_KEY"` with the **private key** of your **node wallet** (keep the quotes).

After the config file changes, restart your node(s). **If you run several nodes, you can use the same config file for all of them.**

If you're building your Operator in Mumbai, copy and paste [this config snippet](#mumbai-node-config) instead.

### Step 4: Fund your nodes
You’ll need a bit of `MATIC` (the gas token of Polygon) in your node’s wallets as Streamr nodes that participate in sponsored streams will periodically make transactions. 1 to 5 `MATIC` is recommended since the nodes will be making a few transactions per day. If the node runs out of gas while they’re a part of an active Sponsorship, then a penalty may be applied to your unclaimed earnings. See [Operator value maintenance](../streamr-network/network-roles/operators.md#operator-maintenance).

### Step 5: Fund your Operator
Now, on your Operator page in the Streamr Hub UI, fund your Operator with DATA tokens (or if you're in Mumbai, then TEST tokens). There's no minimum amount, but note that the more tokens you fund your Operator with, the more you can accept delegations. The owner (you) must have at least a 5% stake in the Operator.

### Step 6: Check your Operator status
All the checkmarks in the Operator status section on your Operator page should now be green, and you’re ready to join Sponsorships!

![image](@site/static/img/operator-status-green.png)

### Step 7: Join sponsorships
 In the Hub, go to Network -> Sponsorships and find a Sponsorship you want your Operator to start working on. Click the "Join as Operator" button and select your stake. Note there is a minimum stake of 5000 `DATA` tokens for each Sponsorship that you join. Joining Sponsorships locks your tokens for a period of time, defined in the Sponsorship contract.

:::info Important
- **Do NOT** create or sponsor Sponsorships. If you do tokens will be irreversibly sent to that Sponsorship contract. There is no undo for this.
:::

:::info Important
- There's a known connectivity issue using Brave browser. Your node connectivity status may report incorrectly on the Streamr Hub.
:::

## Running a node fleet
Running a fleet of nodes is recommended as it will reduce your risk of slashing. Node private keys can be shared among all your nodes so there is no need to create a unique node address key pair for each node, i.e. You only need to add one node address for *N* nodes if you wish.

A typical node fleet may have 2 - 10 nodes and use a node [Redundancy Factor](../streamr-network/network-roles/operators#node-redundancy-factor) of 2 - 3, for example. 

Checkout the [Testnet FAQ](../streamr-testnets/testnet-faq#what-is-the-advantage-of-operators-running-multiple-nodes) for more commentary on running multiple nodes.

<div id="testnet-configuration-node-config"></div>

## Testnet node config
Below is the template you can use to override and replace the contents of your config file with. You can copy this snippet or download the [JSON file](../../static/assets/default.json). 

```json
{
    "client": {
        "auth": {
            "privateKey": "NODE_PRIVATE_KEY"
        }
    },
    "plugins": {
        "operator": {
            "operatorContractAddress": "OPERATOR_CONTRACT_ADDRESS"
        }
    }
}
```

## The Mumbai test environment
The [Mumbai Hub](https://mumbai.streamr.network) is the place to test out your Operator before creating it on Polygon with real tokens.

You'll need Mumbai `MATIC` - widely available with [public faucets](https://mumbaifaucet.com) and you'll need ` TEST` tokens (the Mumbai network's worthless `DATA` tokens) - There is a `TEST` token faucet on the [Streamr Discord](https://discord.gg/gZAm8P7hK8).

## Mumbai node config
Below is the template you can use to override and replace the contents of your config file with. You can copy this snippet or download the [JSON file](../../static/assets/mumbai-default.json). 

:::info Important
- This is the Mumbai configuration. If you want to participate in the incentivized testnets, use the [testnet configuration](#testnet-node-config).
:::

```json
{
    "client": {
        "metrics": false,
        "auth": {
            "privateKey": "NODE_PRIVATE_KEY"
        },
        "network": {
            "controlLayer": {
                "entryPoints": [
                    {
                        "id": "e1",
                        "websocket": {
                            "host": "entrypoint-1.streamr.network",
                            "port": 40401,
                            "tls": true
                        }
                    },
                    {
                        "id": "e2",
                        "websocket": {
                            "host": "entrypoint-2.streamr.network",
                            "port": 40401,
                            "tls": true
                        }
                    }
                ]
            }
        },
        "contracts": {
            "streamRegistryChainAddress": "0x4F0779292bd0aB33B9EBC1DBE8e0868f3940E3F2",
            "streamStorageRegistryChainAddress": "0xA5a2298c9b48C08DaBF5D76727620d898FD2BEc1",
            "storageNodeRegistryChainAddress": "0xE6D449A7Ef200C0e50418c56F84079B9fe625199",
            "mainChainRPCs": {
                "name": "mumbai",
                "chainId": 80001,
                "rpcs": [
                    {
                        "url": "https://rpc-mumbai.maticvigil.com"
                    }
                ]
            },
            "streamRegistryChainRPCs": {
                "name": "mumbai",
                "chainId": 80001,
                "rpcs": [
                    {
                        "url": "https://rpc-mumbai.maticvigil.com"
                    }
                ]
            },
            "theGraphUrl": "https://api.thegraph.com/subgraphs/name/samt1803/network-subgraphs"
        }
    },
    "plugins": {
        "operator": {
            "operatorContractAddress": "YOUR_OPERATOR_CONTRACT_ADDRESS"
        }
    }
}
```

## Troubleshooting
**Failed to publish to stream... Cause: You don't have permission to publish to this stream...**

This happens if you have not added your [node address to your Operator](#step-3-pair-your-node-with-your-operator-contract). Please complete this step and restart your node.

Also make sure to check the [Streamr node troubleshooting section](./how-to-run-streamr-node.md#troubleshooting).

## Safety
**Please be aware of some important safety tips during the testnets:**

:::info Important
Your tokens are at risk by participating in these testnets - [the risks are real](../streamr-network/network-roles/operators.md#operator-risks).
:::

- Consider starting small with your stake amount during the testnets and use common sense to never stake more than you can afford to lose. A professional audit of the incentive layer has been completed by Cyfrin, but nothing can be guaranteed of course. 
- If you want to stake on a sponsorship, DO NOT click on the "Sponsor". That's for funding the sponsorship, not staking! Instead, go to the sponsorship you want to stake on and click "Join as an operator” and enter the amount. 
- There may be an increase in activity by scammers during the testnets. A common approach is to pretend to offer help or tech support in direct messages (something we never do). Report any account that is asking you to sign transactions or asking for any sort of credentials such as your private key. These accounts are trying to steal your tokens. It’s advised you disable DMs on Discord. More tips can be found in #server-safety-guide. 