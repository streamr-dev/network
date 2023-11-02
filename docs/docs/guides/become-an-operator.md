---
sidebar_position: 5
---

# How to become an Operator
**TL;DR Do these things to become an earning Streamr node Operator:**

- Deploy an Operator smart contract. 
- Run a Streamr node and pair it with your Operator. 
- Stake `DATA` tokens on your Operator and give your nodes some `MATIC`
- Join Sponsorships through your Operator that will earn you DATA tokens.

## Migrating from Brubeck

If you’ve been running a Streamr node in the past you might be familiar with a two step process– run some software and stake some tokens, i.e. a software step and a blockchain step. Behind the scenes, the Streamr core team would validate user’s stake and transfer tokens to node runner wallets at the end of each month. This has worked, but its been highly centralized. With the introduction of stream Sponsorships, Operators, Sponsors and Delegators we now have everything we need for a peer to peer decentralized and market based incentivization on Streamr. The most important role is the Operator, so let's learn how to become one.

:::tip Streamr 1.0 network versus the Brubeck (older) network
- You can run ~~up to 5 nodes per IP address~~ any number of nodes from the same IP address, although one node per machine is recommended
- Rewards are ~~automatically paid out at the beginning of the following month~~ claimed from active Sponsorships periodically
- You can stake ~~up to 20K DATA per node~~ as much as you want. Note that at least 5% of Operator stake must come from the owner, and therefore delegations can not exceed 95%.
- To participate in the testnets, use specific versions/tags of the Streamr node software, such as `100.0.0-pretestnet.0`. The `latest` tag still points to the previous milestone (Brubeck) software.
- There is no need for a "beneficiary address" in Streamr 1.0. Instead, the node configuration contains the Operator contract address.
:::

## Operator setup instructions
Follow these steps below to setup your Operator so that you can participate in the protocol and collect rewards. 

### Step 1: Deploy your Operator Contract
Currently you can practice your Operator deployment in the Mumbai pre-testnet. Go the the [Mumbai Streamr Hub](https://mumbai.streamr.network/hub), Navigate to Network -> Operators, then click "Become an Operator" and complete the dialog. The [Operator contract](../streamr-network/network-roles/operators#the-operator-contract) is deployed on the Polygon Mumbai blockchain.


The wallet/account that you use to make the Operator creation transaction will be known as the **Owner wallet**. It's the wallet you'll use to control your Operator business. The owner wallet controls the Operator and is able to stake and unstake on Sponsorships, update the Operator settings, and withdraw the owner's share of the Operator's stake and earnings. This should be a very secure wallet as it controls the whole Operator. A hardware wallet (Ledger, etc) is recommended, although a software wallet (Metamask) will work too - just be sure to keep the account private and never share your private key or seed phrase with anyone.

You'll need to decide on your [owner's cut](../streamr-network/network-roles/operators#owners-cut) at the time of deployment. You'll be able to change this value later on, as long as you unstake from all Sponsorships first.

### Step 2: Run a Streamr node
Spin up a Streamr node using this [guide](./how-to-run-streamr-node.md). 

Nodes will consume resources, mainly bandwidth and CPU. RAM usage is moderate and disk usage in negligible. 

Running multiple nodes on the same virtual machine (VM) is not in your best interest. The point of running multiple nodes is redundancy as well as load balancing/horizontal scaling, neither of which are really achieved if multiple nodes run on the same VM. Ideally each VM would run on separate physical hardware or geographical location.

While there are no strict hardware recommendations, 8GB of RAM, 3-4 virtual cores, and ideally 1Gbps bandwidth would be a safe bet for participating in most [stream Sponsorships](../streamr-network/incentives/stream-sponsorships.md).

:::caution Important
- A public IP is a must
-  A TCP port for WebSocket connectivity must be open. The port is configurable and the default is 32200.
:::

### Step 3: Pair your node with your Operator contract
Once your familiar with your node you'll need to update its config file with the address of your Operator contract. If you're in the Mumbai test environment, you'll want to copy and paste [this config snippet](#mumbai-testing-environment-node-config), and replace the `"YOUR_OPERATOR_CONTRACT_ADDRESS"`and `"NODE_PRIVATE_KEY"` with your own (and keep the "quotes"). For the testnets, keep an eye on the [official testnet page](../streamr-testnets/testnets.md) for the correct configuration to enter. 



### Step 4: Fund your nodes
You’ll need a bit of `MATIC` (the gas token of Polygon) in your node’s wallets as Streamr nodes that participate in sponsored streams will periodically make transactions. 1 to 5 `MATIC` is recommended since the nodes will be making a few transactions per day. If the node runs out of gas while they’re a part of an active Sponsorship, then a penalty may be applied to your unclaimed earnings. See [Operator value maintenance](../streamr-network/network-roles/operators#operator-maintenance).

### Step 5: Fund your Operator
Now, on your Operator page in the Streamr Hub UI, fund your Operator with DATA tokens (on Mumbai, TEST tokens). There's no minimum amount, but note that the more you fund, the more you can accept delegations. The owner (you) must have at least a 5% stake in the Operator.

### Step 6: Join sponsorships
All the checkmarks in the Operator status section on your Operator page should now be green, and you’re ready to join Sponsorships! In the Hub, go to Network -> Sponsorships and find a Sponsorship you want your Operator to start working on. Click the "Join as Operator" button and select your stake. Note there is a minimum stake of 5000 `DATA` tokens for each Sponsorship that you join.

## The Mumbai test environment
You can configure your node to connect with the Mumbai testnet (not to be confused with the Streamr incentivized testnets that will run on Polygon with real tokens). The Mumbai environment is handy for testing Operator..operations with fake tokens.

Mumbai has it's own UI - the [Mumbai Hub](https://mumbai.streamr.network). Your node will need to be configured with the [Mumbai config](#mumbai-testing-environment-node-config)

You'll need Mumbai `MATIC` - widely available with [public faucets](https://mumbaifaucet.com) and you'll need `TEST` tokens (the Mumbai network's worthless `DATA` tokens) - you can ask for those on the [Streamr Discord](https://discord.gg/gZAm8P7hK8) and a community admin will send you some to your address. 

The only information they will need from you is your address. Please do not engage with any accounts claiming to be Support, Admin or Help. Report any account that is asking you to sign transactions or asking for any sort of credentials such as your private key. These accounts are trying to steal your tokens.

### Mumbai testing environment node config:
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

## Testnet configuration
Editing the `config/default.json` is the main way to configure your node.

To participate in the incentivized testnets, you'll need to add a few extra lines of config to your node. That config can be found on the [dedicated testnet page](../streamr-testnets/testnets.md) closer to the date of the testnets.