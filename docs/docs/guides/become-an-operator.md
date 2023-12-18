---
sidebar_position: 6
---

# How to become an Operator
**TL;DR 👨‍💻 Do these things to become an earning Streamr node Operator:**
- Deploy an Operator smart contract. 
- Run Streamr node(s) and pair them with your Operator.
- Stake `DATA` tokens on your Operator 
- Give your node address a few `MATIC`
- Join Sponsorships through your Operator that will earn you DATA tokens.

### Testnet schedule
Checkout the official [Streamr Testnets page](../streamr-testnets/testnets.md) for the latest news and updates related to the incentivized three testnets running over December 2023 and January 2024.

### Migrating from an older network
See these helpful FAQs advice on:
- [Migrating from Brubeck to Streamr 1.0](../streamr-testnets/testnet-faq.md#migrating-from-brubeck-to-streamr-10).
- [Migrating from the Mumbai testing environment to Streamr 1.0](../streamr-testnets/testnet-faq.md#migrating-from-the-mumbai-testing-environment-to-stream-10).

## Operator setup instructions
Follow these steps below to setup your Operator so that you can participate in the protocol and collect rewards. 

### Step 1: Deploy your Operator
In the [Streamr Hub](https://streamr.network/hub/network/operators), connect your wallet (top-right corner), navigate to Network -> Operators, then click "Become an Operator" and complete the dialog. The [Operator contract](../streamr-network/network-roles/operators.md#the-operator-contract) is deployed on the Polygon blockchain.

The wallet/account that you use to make the Operator creation transaction will be known as the **Owner wallet**. It's the wallet you'll use to control your Operator business. The owner wallet controls the Operator and is able to stake and unstake on Sponsorships, update the Operator settings, and withdraw the owner's share of the Operator's stake and earnings. This should be a very secure wallet as it controls the whole Operator. A hardware wallet (Ledger, etc) is recommended, although a software wallet (Metamask) will work too - just be sure to keep the account private and never share your private key or seed phrase with anyone.

You'll need to decide on your [owner's cut](../streamr-network/network-roles/operators.md#owners-cut) at the time of your Operator deployment. You'll be able to change this value later on, as long as you unstake from all Sponsorships first. The average cut Operators are choosing appears to be around 10%.

You can also practice your Operator deployment in the Mumbai environment with the [Mumbai Streamr Hub](https://mumbai.streamr.network/hub) (rather than switching networks on the Streamr Hub). You'll need Mumbai `MATIC` - widely available with [public faucets](https://mumbaifaucet.com) and you'll need ` TEST` tokens (the Mumbai network's worthless `DATA` tokens) - There is a `TEST` token faucet on the [Streamr Discord](https://discord.gg/gZAm8P7hK8).

### Step 2: Run a Streamr node
Spin up a Streamr node using the **[How to run a Streamr node guide](./how-to-run-streamr-node.md)**. 

During this node setup process you'll be generating a **node address** that will be needed for [Step 3](#step-3-pair-your-operator-to-your-streamr-node). 

### Step 3: Pair your Operator to your Streamr Node
Your Operator smart contract (that you created in [Step 1](#step-1-deploy-your-operator)) needs to be made aware of your Streamr node address (created in [Step 2](#step-2-run-a-streamr-node)). If you plan to run several nodes, they can all share the same node address.

Visit your [Operator page](https://streamr.network/hub/network/operators) and find the "Operator's node addresses" section (towards the bottom of the Operator page). Click the ***Add node address*** button, paste in your **node address** (the Ethereum public address, not its private key!), click the button in the dialog and remember to click the ***Save*** button.

![image](@site/static/img/node-addresses.png)

If you had no issues, you can now start (or restart) your Streamr node and move on to [Step 4](#step-4-fund-your-node-address). 

If you have setup your Streamr node in some other way, you may need to [manually edit the node's config file](./how-to-run-streamr-node.md#manually-updating-the-node-config-file) to include your **Operator address** (found near the top of your Operator page in the Streamr Hub).

**Reminder:** Your node private key is not your node address (the address is the public address that matches with the private key). You should not hold significant value on this address.

### Step 4: Fund your node address
You’ll need some `MATIC` (the gas token of Polygon) in your node address since the node(s) will periodically make transactions. Approximately 10 `MATIC` is recommended since the nodes will be making a few transactions per day.

If the node runs out of gas while they’re a part of an active Sponsorship, then a penalty may be applied to your unclaimed earnings. See [Operator value maintenance](../streamr-network/network-roles/operators.md#operator-maintenance).

### Step 5: Fund your Operator
On your [Operator page](https://streamr.network/hub/network/operators), fund your Operator with `DATA` tokens (or if you're in Mumbai, then it's `TEST` tokens). There's no minimum amount, but note that the more tokens you fund your Operator with, the more you can accept delegations. The owner (you) must have at least a 5% stake in the Operator. Also be aware the there is a global minimum of 5k `DATA` tokens to join Sponsorships. Joining Sponsorships is required to earn tokens as an Operator.

### Step 6: Check your Operator status
All the checkmarks in the Operator status section on your Operator page should now be green, and you’re ready to join Sponsorships!

:::info
- There's a known connectivity issue using Brave browser. Your node connectivity status may report incorrectly on the Streamr Hub.
:::

![image](@site/static/img/operator-status-green.png)

Be patient, this check may take more than 30 seconds. If you're observing issues, [see this FAQ](../streamr-testnets/testnet-faq.md#my-node-appears-to-not-be-running-andor-are-not-reachable-on-the-streamr-hub).

### Step 7: Join sponsorships
Visit the [Sponsorships page](https://streamr.network/hub/network/sponsorships) and find a Sponsorship you want your Operator to start working on. Click the **"Join as Operator"** button and select your stake. Note there is a minimum stake of 5000 `DATA` tokens for each Sponsorship that you join. Joining Sponsorships may lock your tokens for a period of time, defined in the Sponsorship contract.

:::info Warning
- **Do NOT** create or sponsor Sponsorships. If you do tokens will be irreversibly sent to that Sponsorship contract. There is no undo for this.
:::

## Running a node fleet
Running a fleet of nodes is recommended as it will reduce your risk of slashing. Node private keys can be shared among all your nodes so there is no need to create a unique node address key pair for each node, i.e. You only need to add one node address for *N* nodes if you wish.

A typical node fleet may have 2 - 10 nodes and use a node [Redundancy Factor](../streamr-network/network-roles/operators#node-redundancy-factor) of 2 - 3, for example. 

Checkout the [Testnet FAQ](../streamr-testnets/testnet-faq#what-is-the-advantage-of-operators-running-multiple-nodes) for more commentary on running multiple nodes.

## The Mumbai test environment
The [Mumbai Hub](https://mumbai.streamr.network) is the place to test out your Operator before creating it on Polygon with real tokens. You'll need to use the [Mumbai node config](./how-to-run-streamr-node.md#mumbai-node-config).

You'll need Mumbai `MATIC` - widely available with [public faucets](https://mumbaifaucet.com) and you'll need ` TEST` tokens (the Mumbai network's worthless `DATA` tokens) - There is a `TEST` token faucet on the [Streamr Discord](https://discord.gg/gZAm8P7hK8).

## Mumbai node config
Below is the template you can use to override and replace the contents of your config file with. You can copy this snippet or download the [JSON file](../../static/assets/mumbai-default.json). 

:::info
- This is the Mumbai configuration. If you want to participate in the incentivized testnets, use the [testnet configuration](#testnet-node-config).
:::

```json
{
    "client": {
        "metrics": false,
        "auth": {
            "privateKey": "NODE_PRIVATE_KEY"
        },
        "environment": "mumbai"
    },
    "plugins": {
        "operator": {
            "operatorContractAddress": "YOUR_OPERATOR_CONTRACT_ADDRESS"
        }
    }
}
```

## Troubleshooting
Checkout the [testnet FAQ](../streamr-testnets/testnet-faq.md) it covers all the technical and token questions you have been wondering about. 

## Safety
**Please be aware of some important safety tips during the testnets:**

:::info
Your tokens are at risk by participating in these testnets - [the risks are real](../streamr-network/network-roles/operators.md#operator-risks).
:::

- Consider starting small with your stake amount during the testnets and use common sense to never stake more than you can afford to lose. A professional audit of the incentive layer has been completed by Cyfrin, but nothing can be guaranteed of course. 
- If you want to stake on a sponsorship, DO NOT click on the "Sponsor". That's for funding the sponsorship, not staking! Instead, go to the sponsorship you want to stake on and click "Join as an operator” and enter the amount. 
- There may be an increase in activity by scammers during the testnets. A common approach is to pretend to offer help or tech support in direct messages (something we never do). Report any account that is asking you to sign transactions or asking for any sort of credentials such as your private key. These accounts are trying to steal your tokens. It’s advised you disable DMs on Discord. More tips can be found in #server-safety-guide. 