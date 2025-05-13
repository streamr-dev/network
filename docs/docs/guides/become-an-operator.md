---
sidebar_position: 7
---

# How to become an Operator
**TL;DR 👨‍💻 Do these things to become an earning Streamr node Operator:**
- Deploy an Operator smart contract.
- Run Streamr node(s) and pair them with your Operator.
- Stake `DATA` tokens on your Operator and give your node address a few `POL`
- Join Sponsorships through your Operator that will earn you DATA tokens.

## Operator setup instructions
Follow these steps below to setup your Operator so that you can participate in the protocol and collect rewards.

### Step 1: Deploy your Operator
In the [Streamr Hub](https://streamr.network/hub/network/operators), connect your wallet (top-right corner), navigate to Network -> Operators, then click "Become an Operator" and complete the dialog. The [Operator contract](../streamr-network/network-roles/operators.md#the-operator-contract) is deployed on the Polygon blockchain.

The wallet/account that you use to make the Operator creation transaction will be known as the **Owner wallet**. It's the wallet you'll use to control your Operator business. The owner wallet controls the Operator and is able to stake and unstake on Sponsorships, update the Operator settings, and withdraw the owner's share of the Operator's stake and earnings. This should be a very secure wallet as it controls the whole Operator. A hardware wallet (Ledger, etc) is recommended, although a software wallet (Metamask) will work too - just be sure to keep the account private and never share your private key or seed phrase with anyone.

You'll need to decide on your [owner's cut](../streamr-network/network-roles/operators.md#owners-cut) at the time of your Operator deployment. You'll be able to change this value later on, as long as you unstake from all Sponsorships first. The average cut Operators are choosing appears to be around 10%.

You can also practice your Operator deployment in the Polygon Amoy testnet environment with the [Streamr Hub](https://streamr.network/hub) (select "Polygon Amoy testnet" on the Streamr Hub). You'll need Amoy `POL` - widely available with [public faucets](https://faucet.polygon.technology/) and you'll need ` TEST` tokens (the Amoy network's worthless `DATA` tokens) - There is a `TEST` token faucet on the [Streamr Discord](https://discord.gg/gZAm8P7hK8).

### Step 2: Run a Streamr node
Spin up a Streamr node using the **[How to run a Streamr node guide](./how-to-run-streamr-node.md#streamr-node-hardware-recommendations)**.

During this node setup process you'll be generating a **node address** that will be needed for [Step 3](#step-3-pair-your-operator-to-your-streamr-node).

#### **Streamr node hardware recommendations**
Nodes will consume resources, mainly bandwidth and CPU. RAM usage is moderate and disk usage in negligible. While there are no strict hardware recommendations, 4-8GB of RAM, 3-4 virtual cores, and ideally 1Gbps bandwidth would be a safe bet for participating in most [stream Sponsorships](../streamr-network/incentives/stream-sponsorships.md).

- A public IP is necessary.
- A TCP port for [WebSocket connectivity](./how-to-run-streamr-node#websocket-connectivity) must be open. The port is configurable and the default is `32200`.

### Step 3: Pair your Operator to your Streamr Node
Your Operator smart contract (that you created in [Step 1](#step-1-deploy-your-operator)) needs to be made aware of your Streamr node address. If you plan to run several nodes, they can all share the same node address.

You should have a node address after following the **[How to run a Streamr node guide](./how-to-run-streamr-node.md)**. We will now add it to your Operator smart contract.

Firstly, visit your [Operator page](https://streamr.network/hub/network/operators) and find the "Operator's node addresses" section (towards the bottom of the page). Click the ***Add node address*** button, paste in your **node address** (the Ethereum public address, not its private key!), click the button in the dialog and remember to click the ***Save*** button.

![image](@site/static/img/node-addresses.png)

[If you had no issues, you can now start (or restart) your Streamr node and move on to Step 4](#step-4-fund-your-node-address).

If you have setup your Streamr node in some other way, you may need to manually edit the node's Config file to include your **Operator address** (found near the top of your Operator page in the Streamr Hub).

![image](@site/static/img/operator-address.png)

The format of your node config file should match [this template](./how-to-run-streamr-node.md#mainnet-node-config).
- Replace `"YOUR_OPERATOR_CONTRACT_ADDRESS"` with your **Operator address** (keep the quotes).
- Replace `"NODE_PRIVATE_KEY"` with the **private key** of your **node wallet** (keep the quotes).

**Reminder:** Your node private key is not your node address (the address is the public address that matches with the private key). You should not hold significant value on this address.

After any config file change you should restart your node. If you're building your Operator in Amoy (for testing purposes), copy and paste [this config snippet](#amoy-node-config) instead.

### Step 4: Fund your Node address
You’ll need a some `POL` (the gas token of Polygon) in your node address since the node(s) will periodically make transactions. 5 to 10 `POL` is recommended since the nodes will be making a few transactions per day.

If the node runs out of gas while they’re a part of an active Sponsorship, then a penalty may be applied to your unclaimed earnings. See [Operator value maintenance](../streamr-network/network-roles/operators.md#operator-maintenance).

### Step 5: Fund your Operator
On your [Operator page](https://streamr.network/hub/network/operators), fund your Operator with `DATA` tokens (or if you're in Amoy, then it's `TEST` tokens). There's no minimum amount, but note that the more tokens you fund your Operator with, the more you can accept delegations. The owner (you) must have at least a 5% stake in the Operator. Also be aware the there is a global minimum of 5k `DATA` tokens to join Sponsorships. Joining Sponsorships is required to earn tokens as an Operator.

### Step 6: Check your Operator status
All the checkmarks in the Operator status section on your Operator page should now be green, and you’re ready to join Sponsorships!

:::info
- There's a known connectivity issue using Brave browser. Your node connectivity status may report incorrectly on the Streamr Hub.
:::

![image](@site/static/img/operator-status-green.png)

Be patient, if you're observing issues, [see this FAQ](../help/operator-faq.md#my-node-appears-to-not-be-running-andor-are-not-reachable-on-the-streamr-hub).

#### WebSocket connectivity
If you're running the node with Docker, then the above guided tutorial will handle the port mapping (`-p 32200:32200`). However, you must also remember to open port `32200` for **external** TCP traffic. Opening ports is environment specific, if you're in a Linux based system, [this guide may be helpful](https://www.digitalocean.com/community/tutorials/opening-a-port-on-linux).

### Step 7: Join sponsorships
Visit the [Sponsorships page](https://streamr.network/hub/network/sponsorships) and find a Sponsorship you want your Operator to start working on. Click the **"Join as Operator"** button and select your stake. Note there is a minimum stake of 5000 `DATA` tokens for each Sponsorship that you join. Joining Sponsorships may lock your tokens for a period of time, defined in the Sponsorship contract.

:::info Warning
- **Do NOT** create or sponsor Sponsorships. If you do tokens will be irreversibly sent to that Sponsorship contract. There is no undo for this.
:::

## Running a node fleet
Running a fleet of nodes is recommended as it will reduce your risk of slashing. Node private keys can be shared among all your nodes so there is no need to create a unique node address key pair for each node, i.e. You only need to add one node address for *N* nodes if you wish.

A typical node fleet may have 2 - 10 nodes and use a node [Redundancy Factor](../streamr-network/network-roles/operators#node-redundancy-factor) of 2 - 3, for example.

Checkout the [Operator FAQ](../help/operator-faq.md#what-is-the-advantage-of-operators-running-multiple-nodes) for more commentary on running multiple nodes.

## Responsibilities and expectations
Node Operators play a crucial role in maintaining the reliability and performance of the Streamr Network. As an operator, your primary responsibility is to ensure that your nodes are consistently running, relaying data efficiently, and meeting network standards. Most operators manage a fleet of nodes with a [Redundancy Factor](../streamr-network/network-roles/operators#node-redundancy-factor) of 2 or higher to ensure high availability.

If your Operator contract offers a competitive owner’s cut, you’re likely to attract delegators. These delegators rely on your oversight as an Operator and the performance of your node fleet to participate effectively in the Sponsorship economy, maximizing their yield potential while supporting you.

### Staying informed
To stay up to date with the latest network developments, Operators should join the [Streamr Discord](https://discord.gg/gZAm8P7hK8) and regularly check the **#node-announcements** channel. Here, the Streamr team shares critical updates, including:

- **Node software updates**  
- **New sponsorship opportunities**  
- **Network status announcements**  

Staying informed ensures your nodes remain compliant with the latest requirements and operate smoothly within the network.

### Don't overcommit your node fleet
When you join a stream Sponsorship you are committing to relay data for that stream. You should not commit to more than your node fleet can handle, both in terms of bandwidth and CPU. Each stream Sponsorship has different requirements and each Sponsorship will increase the load on your node fleet.

### Be contactable
While not strictly required, it’s recommended to provide contact details on your Operator page, such as an email address or Discord handle. This allows the Streamr team or your delegators to reach you quickly if needed.

Additionally, building a presence within the Streamr community—by engaging with others and offering support on Discord—can enhance your reputation and credibility as an Operator.

### Keeping node software up to date
Streamr developers continuously improve the Streamr node software. You can review the latest updates in the published [release notes](https://github.com/streamr-dev/network/blob/main/CHANGELOG.md). Updates may include new features, bug fixes, and performance improvements.

While the Streamr team provides regular updates on the **#node-announcements** Discord channel, it’s ultimately your responsibility as an Operator to ensure your nodes run at least the minimum recommended software version. Occasionally, new versions will be released that require prompt action— for critical updates we expect **operators to update their nodes within 24 hours**. While we hope to minimize the frequency of such announcements, Operators must be ready to update their nodes to maintain network compatibility and avoid potential issues. If Operators do not update their nodes in time, they may be unable to earn from stream sponsorships and in extreme cases could even be slashed.

## The Amoy test environment
The [Streamr Hub](https://streamr.network/hub) is the place to test out your Operator before creating it on Polygon with real tokens, just select "Polygon Amoy testnet" from top-right network selector. You'll need to use the [Amoy node config](./how-to-run-streamr-node.md#amoy-node-config).

You'll need Amoy `POL` - widely available with [public faucets](https://faucet.polygon.technology/) and you'll need ` TEST` tokens (the Amoy network's worthless `DATA` tokens) - There is a `TEST` token faucet on the [Streamr Discord](https://discord.gg/gZAm8P7hK8).

## Amoy node config
Below is the template you can use to override and replace the contents of your config file with. You can copy this snippet or download the [JSON file](../../static/assets/testnet-default.json).

:::info
- This is the Amoy configuration. If you want to participate with real tokens, use the [Mainnet configuration](#mainnet-node-config).
:::

```json
{
    "client": {
        "metrics": false,
        "auth": {
            "privateKey": "NODE_PRIVATE_KEY"
        },
        "environment": "polygonAmoy"
    },
    "plugins": {
        "operator": {
            "operatorContractAddress": "YOUR_OPERATOR_CONTRACT_ADDRESS"
        }
    }
}
```

## Troubleshooting
Checkout the [Operator FAQ](../help/operator-faq.md) it covers all the technical and token questions you have been wondering about.

## Choosing a different WebSocket port
While entirely optional, if the default port is not suitable for you then you can change it by adding a `controlLayer` entry to your node config like so:

```json
"client": {
    ...
    "network": {
        "controlLayer": {
            "websocketPortRange": {
                "min": 16100,
                "max": 16100
            }
        }
    },
    ...
}
```

## Safety
**Please be aware of some important safety tips:**

:::info
Your tokens are at risk and [the risks are real!](../streamr-network/network-roles/operators.md#operator-risks).
:::

- Consider starting small with your stake amount and use common sense to never stake more than you can afford to lose. A professional audit of the incentive layer has been completed by Cyfrin, but nothing can be guaranteed of course.
- If you want to stake on a sponsorship, DO NOT click on the "Sponsor". That's for funding the sponsorship, not staking! Instead, go to the sponsorship you want to stake on and click "Join as an operator” and enter the amount.
- There may be an increase in activity by scammers. A common approach is to pretend to offer help or tech support in direct messages (something we never do). Report any account that is asking you to sign transactions or asking for any sort of credentials such as your private key. These accounts are trying to steal your tokens. It’s advised you disable DMs on Discord. More tips can be found in #server-safety-guide.