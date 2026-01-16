---
sidebar_position: 2
---

# Operator FAQ

## General
#### Migrating from Brubeck to Streamr 1.0 
If you’ve been running a Streamr node in the past you might be familiar with a two step process– run some software and stake some tokens, i.e. a software step and a blockchain step. Behind the scenes, the Streamr core team would validate user’s stake and transfer tokens to node runner wallets at the end of each month. This has worked, but it's been highly centralized. With the introduction of stream Sponsorships, Operators, Sponsors and Delegators we now have everything we need for a peer to peer decentralized and market based incentivization on Streamr. The most important role is the Operator, so let's learn how to become one.

:::info Streamr 1.0 network versus the Brubeck (older) network
- You can run ~~up to 5 nodes per IP address~~ any number of nodes from the same IP address, although one node per machine is recommended
- Rewards are ~~automatically paid out at the beginning of the following month~~ claimed from active Sponsorships at any time
- You can stake ~~up to 20K DATA per node~~ as much as you want. Note that at least 5% of Operator stake must come from the owner, and therefore delegations can not exceed 95%.
- To participate, you can use the `latest` tag. NPM package and docker images will automatically refer to the latest version if no version tag is given.
- There is no need for a "beneficiary address" in Streamr 1.0. Instead, the node configuration contains the Operator contract address.
:::

##### Why upgrade?
The 1.0 mainnet Operator contract supports the minimum delegation period feature introduced as part of [SIP-20](https://vote.streamr.network/#/proposal/0x12f43b57d6f636875197bbadfff2b75de05bf866332353aa0cf11b993aaffc5d). While it sounds like a relatively minor new feature, it was introduced for a good reason, so upgrading is recommended.

In the testnet version of the Operator contract, an abusive pattern is possible whereby a Delegator first delegates, then collects earnings to update the Operator value, then immediately undelegates, creating an instantaneous profit. Repeating this pattern in rapid succession across many Operators allows the abusive Delegator to potentially create excessive earnings compared to delegating normally. Those excessive earnings reduce the earnings of the Operators and other Delegators.

The minimum delegation period prevents Delegators from rapidly cycling through Operators and taking advantage of the above pattern. By disrupting the loop and slowing it down, the abusive pattern becomes less attractive and no longer gives a meaningful advantage.

##### Should I upgrade now?
If you want to get protection against the above abusive behavior, then yes. We recommend doing so. You can also upgrade at any time in the future.

##### How to upgrade?
Newly created Operators support the minimum delegation period feature, while Operators created during the testnets don’t. So in short, you just need to create a new Operator, move your nodes and tokens there, and abandon the old Operator.

The [docs](../guides/become-an-operator.md) detail the general process of becoming an Operator, but here is a quick summary specifically for this case:

1. Unstake your old Operator from all Sponsorships and withdraw all your tokens from it.
2. Use the Edit Operator feature to rename your old Operator. Please indicate in the name that it’s no longer active. For example if your Operator is called “Goofy”, you can rename it to “Goofy (old)”.
3. Create a new owner wallet (you can not create a new Operator using the old owner wallet).
4. Transfer your DATA tokens from the old owner wallet to the new owner wallet.
5. Create a new Operator using the new owner wallet and the Streamr Hub.
6. Add your node addresses to the new Operator (you don’t need to change the node addresses)
7. Update the operatorContractAddress in your node config files to point to the new Operator and restart your nodes.
8. Use the new owner wallet to Fund the new Operator using the Hub UI.

If you have any questions or need help, please turn to the #node-operators channel on the project [Discord](https://discord.com/invite/gZAm8P7hK8).

#### What are the differences between the Brubeck network and the 1.0 network?
In the old Brubeck network, people would cram multiple Streamr nodes into the cheapest possible VMs to optimize earnings vs. costs, but that only made sense because the nodes weren't doing much in terms of actual work. Now the nodes will be doing actual work by relaying data in the streams that the node Operator stakes on, and this has a few consequences:
- One node per VM is now the only pattern that makes sense really - there's nothing to gain (but redundancy to lose) by running multiple nodes on the same VM
- The VMs should have a bit more punch to be able to handle the data traffic that the Operator signs up for. Whereas in Brubeck you could run on tiny VMs, now it's better to run 'medium' size VMs with, say, 8 GB of RAM and 2-4 cores.
- There's no more artificial staking cap like you could stake only 20k DATA per node in Brubeck. So in the big picture, people will be running less nodes, but bigger nodes.
- The Operator can get slashed if other nodes notice that a particular Operator's nodes are not online or are not doing the work. There's built-in redundancy and load balancing which defends against slashing, but it will get the Operator slashed if for example all of their nodes go down for a longish while such as 30-60 minutes.
- Somewhat related to the above point, the nodes should have a public IP address for the most reliable connectivity, so that other nodes can easily connect to them to verify they are online.

#### Are there any worries that current node operators that have > 5-10 nodes may amalgamate them and thereby provide a little less strength to the network as a whole? 
From the 'network strength' perspective (interpreted to mean from the decentralization and security perspective), it might actually be a net positive change. Example: If I had a stream and wanted to incentivize node operators to relay and secure it, for my money I'd rather get 100 independent operators, with 2 nodes each working on my stream (for a total of 200 nodes), rather than just 200 whatever nodes, out of which 100% might be run by the same person in the same data center, which wouldn't offer much improvement in terms of decentralization or robustness. 

So, it's not wrong to think that more nodes in a stream is better, but it's an oversimplification that completely ignores any quality aspect. The goal in 1.0 is to give sponsors what they pay for, which is essentially robustness and security for their stream, and those are achieved through a sufficient amount of decentralized nodes doing the work.

#### How do I get DATA tokens?
You'll need at least 5k `DATA` tokens to participate in any Sponsorship. The `DATA` token is traded on [exchanges](https://coinmarketcap.com/currencies/streamr/#Markets). You'll need to either withdraw to Polygon, or bridge Ethereum mainnet tokens using the [Polygon bridge](https://wallet.polygon.technology/polygon/bridge/deposit). Please [stay safe](#safety)! 

## Technical
#### What are the hardware requirements for running nodes?
The main resources demanded of Streamr nodes are bandwidth and CPU. Memory usage is moderate and there's no storage requirement since the node doesn't write anything to disk. Generally speaking, a medium size VM with 8GB of RAM, 3-4 virtual cores, and ideally 1Gbps bandwidth is a safe choice, though you may get by with much lower specs as well. An idle Raspberry Pi may also be used as a Streamr node. 

These requirements are approximate and they depend on the demands of each stream Sponsorship that the Operator chooses to join. Sponsorship earnings stack, and so do the requirements on the node to service each sponsored stream.

#### Should I run multiple nodes?
Running a fleet of nodes with a redundancy factor greater than one is recommended incase one of your nodes has an outage while servicing a stream. Ideally each node would run on separate physical hardware or in a separate geographical location. It isn’t useful to run multiple nodes on the same device or virtual machine (VM).

Nodes will be doing real work on real streams, and the amount one can stake/earn is not directly limited by the number of nodes. Still of course, more nodes can do more work and that potentially allows you to earn more, so the relationship is more indirect.

Learn more about [node redundancy](../streamr-network/network-roles/operators.md#node-redundancy-factor).

#### What is the advantage of Operators running multiple nodes?
With more nodes, Operators can do more work and/or have more redundancy to protect from slashing. Theoretical example:
- Say there's a sponsored stream which has so much data that it takes 100% of the capacity of any node that works on it. (In practice such heavy streams should be partitioned, and therefore the work would be distributed more evenly, but let's entertain this for the sake of example!)
- If the user runs 1 node, it will be working at full capacity and the owner shouldn't stake on any other sponsorships (or else their node becomes overloaded and risks getting slashed). Also if that single node goes down, they will get slashed.
- If the user runs 2 nodes, and their `redundancyFactor` setting is 2, then both nodes will be working at full capacity and they still can not take on more work, but now the failure of 1 node won't lead to slashing.
- If the user runs 5 nodes, and their `redundancyFactor` setting is 2, then only 2 of their nodes are working on that heavy stream at full capacity and the other 3 are doing nothing, enabling them to stake on other sponsorships to take on more work and earn more rewards. They are also well protected from slashing as multiple nodes could fail without any of the work getting neglected.

#### Failed to publish to stream... Cause: You don't have permission to publish to this (coordination) stream
If you see an error like this:
`WARN [2023-10-31T10:19:06.979] (announceNodeToStream): Unable to publish to coordination stream`
Then it is likely that you have not added your [node address to your Operator](../guides/become-an-operator.md#step-3-pair-your-node-with-your-operator-contract). Complete this step and restart your node.

#### My node appears to not be running and/or are not reachable on the Streamr Hub
Firstly, it's best to check on your node using the Chrome browser- There's a known connectivity issue using Brave browser.

The Operator status checks involve a peer-to-peer connection between your browser and your node. This means that a connection needs to be formed from the network that you're browsing in, to the network that your node is running on. This means that if you are browsing from inside a heavily controlled public WiFi hotspot for example, then it may show as a problem with your node, when in fact it may be a problem with the network you are in.

Next you should check the logs of your node? Are there any suspicious logs? Warnings about **WebRTC private address probing** are normal and expected. Warnings such as **Failed to publish to stream** indicate a problem with the configuration of your node- follow the steps closely inside the [Become an Operator guide](../guides/become-an-operator.md)

If your node is running but is unreachable then there may be a WebSocket port connectivity issue. Ensure that you have opened the port, as described in the how to [run a stream node guide](../guides/how-to-run-streamr-node#websocket-connectivity). There are various online resources available for port forwarding on the Internet.

#### Is there a way to monitor performance of my nodes?
At the moment we're leaving this opportunity available for the community to create tooling to help Operators manage their fleet of nodes.

You will have to monitor that your nodes aren't exhausted by the work you sign up for (by staking on sponsorships)
It's quite straight forward to build tooling for the day-to-day tasks of node operators, and while the core Streamr devs will help cover the basics, we warmly welcome people in the community to help create useful tooling!

#### Can I perform maintenance on my nodes (leading to downtime) without being slashed?
Node operators are able to configure a Redundancy Factor parameter, which controls how many of your nodes are doing overlapping work. For example if you run 5 nodes and set the Redundancy Factor to 2, then each item of work (relaying a stream-partition) will be done by two out of of those 5 nodes. Then, even if one node fails, you'll still be doing the promised work with the one healthy node - plus within a minute or so, one of the previously uninvolved nodes will automatically pick up the task and now you will again have 2 (out of 4) nodes doing the work for redundancy.

#### What ports need to be opened?
TCP traffic on port `32200`. 

Usage of this port is new in 1.0. Operator nodes doing work for incentives need to have this port open. Other ports are open only if particular plugins used for data integration (mqtt etc.) are enabled.

#### Is there a way to specify a port, or port range, instead of using the default port 32200?
Yes. Add this `controlLayer` section to your node config and change the port to something in your acceptable range. 

For example,
```json
"client": { 
    "network": { 
        "controlLayer": { 
            "websocketPortRange": { 
                "min": 16100, 
                "max": 16100 
            } 
        } 
    } 
}
```

#### Will there be a GUI to "control" the node from a "distance" or do i have to do "things" directly on the node? I run a Raspberry Pi (rpi3b+) without a GUI that I control with putty.
You'll need to update the node's config file at the beginning. That's the main thing. Then, keep it healthy and connectable. 

The Streamr Hub is the UI provided by Streamr that will allow you to make transactions that "control" your node. For example, you'll use the Hub to make transactions that join you to stream Sponsorships. Your node will be watching the blockchain and responding to your transaction by joining that stream topology and it will start relaying data on its own.

#### How many nodes can I run from a single IP address?
As many as you want. There’s no restriction.

#### Are Sponsorships for individual stream partitions?
No, the sponsoring is for ALL partitions in the stream. The partitions get load balanced to your fleet of operator nodes with the chosen redundancy factor. So for example with a redundancy factor of 2, a particular partition would be picked up by two different nodes in the fleet.

#### Can I run multiple nodes with the same private key?
Yes. 

#### Can we share private key for 25 nodes? In this case will the Operator recognize 1 node or 25 nodes?
Node addresses do not equal nodes. In other words, yes, you can share private keys among all your nodes.

#### Is there any benefit to having two or more node addresses added to the Operator and managing POL balance on multiple wallets instead of having a single node address for all nodes in my fleet?
It is perhaps easier to debug if something goes wrong but there's no other benefits to having multiple addresses for each of your fleet nodes.

#### As an Operator, can I generate the node signing key in memory?
No. The node signing key must be known and persist so that it can be paired with the Operator Contract.

#### Which address do I need to fund?
You need to fund your node address(es) with a small amount of `POL` tokens.

### Troubleshooting common issues
#### Issue:
I’m receiving the following warning message. 

`WARN [2023-11-10T13:20:25.166] (announceNodeToStream): Unable to publish to coordination stream {"streamId":"0x8862ad44a02def6ed8c7325d9e973d0b6747be46/operator/coordination","reason":"Failed to publish to stream 0x8862ad44a02def6ed8c7325d9e973d0b6747be46/operator/coordination. Cause: You don't have permission to publish to this stream. Using address: 0x7d1a19ddd33da670e2c89b227de323e0e52241c7"}`

**Explanation:**
Node has not been added to Operator node addresses under the operator contract on the hub. 

**Solution:**
Add given nodes public key to operator node addresses.

#### Issue:
I’m receiving the following warning message.

```JSON
INFO [2023-11-10T10:52:30.450] (broker              ): Start broker version v100.0.0-testnet-three.3
Error: call revert exception [ See: https://links.ethers.org/v5-errors-CALL_EXCEPTION ] (method="metadata()", data="0x", errorArgs=null, errorName=null, errorSignature=null, reason=null, code=CALL_EXCEPTION, version=abi/5.7.0)
```

**Explanation:**
Operator address given in broker configuration is not an actual operator address.

**Solution:**
Recheck operator address from the hub & reconfigure your node to use the correct operator address.

**Issue:**
I’m receiving the following warning message.

```JSON
WARN [2023-11-10T10:01:42.418] (WebRtcConnection): Failed to set remote descriptor for peer 0a3849076d8a43b19b876fbc6eba935f
WARN [2023-11-10T10:01:42.421] (WebRtcConnection): Failed to set remote candidate for peer 0a3849076d8a43b19b876fbc6eba935f
WARN [2023-11-10T10:01:42.622] (WebRtcConnection): Failed to set remote candidate for peer 0a3849076d8a43b19b876fbc6eba935f
WARN [2023-11-10T10:01:42.867] (WebRtcConnection): Failed to set remote candidate for peer 0a3849076d8a43b19b876fbc6eba935f
```

**Explanation:**
Connectivity issue. 

**Solution:**
Port 32200 or configured port for streamr-node is not open. Check your firewall/docker/router configuration that the port 32200 is open and/or traffic is forwarded through this port.

#### Issue: 
I’m receiving the following warning message.

```JSON
<WARN [2023-11-12T09:20:41.677] (OperatorPlugin      ): Encountered error
    err: {
      "type": "TimeoutError",
      "message": "The Graph did not synchronize to block 42303755 (timed out after 60000 ms)",
      "stack":
          Error: The Graph did not synchronize to block 42303755 (timed out after 60000 ms)
              at Timeout.<anonymous> (C:\Users\jarno\AppData\Roaming\nvm\v18.16.0\node_modules\@streamr\node\node_modules\@streamr\utils\dist\src\withTimeout.js:20:24)
              at listOnTimeout (node:internal/timers:569:17)
              at process.processTimers (node:internal/timers:512:7)
      "code": "TimeoutError"
    }
```

**Explanation:**
Could not synchronize with thegraph blockchain indexing service.

**Solution:**
This is likely an issue with The Graph. Check that your internet connection is active and try to restart the Streamr node. If this doesn’t help, try again in a while, The Graph service may be updating.

## Staking on, and earning from Sponsorships
#### How many sponsorships should I stake on as an operator?
Operators will want to stake on whatever pays best (within the limits of how much data volume their nodes can handle, of course). Example:
- You have 1M DATA and want to allocate it to Sponsorships
- Let's imagine there are two sponsorships: Sponsorship 1 is paying 50% APY and has 1M DATA staked, and Sponsorship 2 is paying 40% APY and has 10M staked
- On first glance, Sponsorship 1 pays a better yield, but it isn't paying much in absolute terms and the APY gets quickly diluted as more stake is placed. If you staked all your 1M DATA on it, the staked amount would double and therefore the APY would halve, becoming 25%. It would then pay worse than the second one.
- Sponsorship 2 is paying 40% on 10M staked, so you adding all of your tokens there wouldn't change the APY that much (to 36%)
- Assuming the volume of data in both streams can be handled by the operator's nodes, an Optimal Operator would compute how much tokens they should stake on each Sponsorship to earn the best combined yield. In the optimal end result, both Sponsorships will be paying the same APY, therefore removing the "anomaly" of the first Sponsorship and returning the market to equilibrium.

<!-- 
TODO
DATA delegated to an Operator are converted in StreamrOp tokens, and explain why and how 1 DATA ≠ 1 StreamrOp.

This is especially confusing in the Undelegate pop-up where Streamr currently tells us we can undelegate X DATA which is false in fact.
We can undelegate/withdraw X StreamrOp tokens which will be converted in DATA tokens that we will receive in our wallet, for a total value of Y DATA tokens initially delegated + Z DATA tokens we gained as interest.
 -->

<!-- TODO Is it possible to reduce the stake without withdrawal penalty by leaving the min stake at the sponsorship? 
The Operator can always reduce down to min stake without penalty. The reasoning is that the operator is still doing the same promised work regardless of the size of the stake.
-->


#### Can Operators get all their tokens out, if they for example want to stop running nodes? What happens to delegations then?
Normally owners need to provide at least 5% of the operator’s total value and keep it in the operator, while 95% can come from delegators. Owners can’t withdraw below this limit and keep operating. However, if they want to quit, they can unstake from all sponsorships and then withdraw all their tokens from the Operator. This is allowed as a special case.

The delegators will then simply leave and delegate to someone else, as they are no longer earning anything with that operator.

#### Will my rewards automatically be sent to my wallet?
No, you will need to periodically check and claim your uncollected earnings from the Operator(s) that you have staked/delegated on.

#### How does the auto collect earnings work?
Nodes work on a collection trigger which is based on how much value there is to collect. The limit to decide whether the earnings are collected upon checking is configurable, and this is defined relative to the limit. The default is halfway to the limit, meaning that uncollected earnings are collected when they equal at least 2.5% of Operator stake. If nodes are running and have enough `POL` to pay for gas, then the 5% uncollected limit should not be exceeded.

These check runs every hour by default. 

#### Does staking mean holding tokens on a beneficiary address?
You'll be staking into a smart contract rather than holding tokens on a beneficiary address. The Operator Contract is synonymous to your beneficiary address.

#### Will I automatically be unstaked from Sponsorships once they run out of tokens?
No. You must manually unstake your Operator.

#### How is Operator funding (self-delegating) and not collecting earnings a bad thing for others?
Anyone getting to 'buy' Operator shares too cheap harms the other parties involved. 
Here's an example where the Operator self-delegates while there's a relatively large amount of pending earnings:

*Operator self-delegates with pending earnings*:
- Operator self-delegated (funds) 10k DATA (Operator on-chain value: 10k, 100% owned by Operator)
- Delegator delegates 10k DATA to Operator (Operator on-chain value: 20k, 50% owned by Operator, 50% by Delegator)
- Operator works on some Sponsorship(s) for a while, say now there's 1k DATA in uncollected earnings (Operator on-chain value: 20k, "realtime" value: 21k)
- The value of Operator's 50% share is 10.5k, and the Delegator's 50% is also worth 10.5k, including a projected share of the uncollected earnings. All is still well.
- Now the Operator self-delegates 20k more (Operator on-chain value: 40k, 75% owned by Operator, 25% by Delegator, and "realtime" value 41k)
- Now the Operator collects the earnings (Operator on-chain value 41k, 75% owned by Operator, 25% by Delegator, no more pending earnings)
- The value of the Operator's position is now 30.75k and the Delegator's is 10.25k.

So by (self-)delegating while there were lots of uncollected earnings, the Operator was able to grab a larger share of the earnings and the Delegator's value dropped from a projected 10.5k to a realized 10.25k.

So as you can see, if the Operator valuation is not correct, it can lead to money-grabbing opportunities either for the Operator or Delegators. Someone gets to "trade with yesterday's prices", and since it's zero-sum, the other side loses. That's why there is a penalty for the Operator if they don't maintain it properly.

*Note this example was simplified and did not include an Operator's cut or protocol fee.

For more, see [Operator maintenance](../streamr-network/network-roles/operators.md#operator-maintenance).

#### As an Operator can I always withdraw tokens from my Operator?
It depends. If you're staked on Sponsorships with minimum stake periods then you'll need to wait for those periods to elapse or pay the 5k DATA early withdrawal penalty. Once unstaked from all Sponsorships and if there is no undelegation que to fulfill then you will be able to withdraw tokens from your Operator.

#### Why are some Sponsorships inactive/not-paying?
Sponsorships each have their own starting criteria, for example, all Sponsorships require at least 1 Operator to join them before they can start to pay out. If there are zero Operators in the Sponsorship then the Sponsorship is inactive.

#### What is the minimum staking/delegation amount?
The global minimum is set to 5k DATA. This value could be changed in the future by governance vote.

## Delegation
#### Do I need to run a node to delegate tokens?
No, you only need `DATA` tokens.

#### As a Delegator can I always withdraw tokens from the Operators that I have delegated to?
Eventually, yes. If there's not enough available balance on the Operator you have delegated on then your withdrawal gets entered into the delegation que. When the Operator has an available balance, your tokens will be withdrawn. This will take at maximum 30 days and will happen automatically with no further action required.

#### Do uncollected earnings impact my undelegation amount (Operator withdrawal)?
Yes. Uncollected earnings are not counted in the undelegation process. If these uncollected earnings are significant and you want them to be counted then you could manually trigger the collection of earnings before undelegating.

#### I have delegated my DATA to an Operator. Are the earnings transferred to my wallet automatically after a period of time or will I have to claim them from the operator page?
Your earned tokens accumulate on the Operator and your share is calculated at the time of undelegation (withdrawal from the Operator). If there's uncollected earnings that are significant, you may want to manually trigger collection so they're made apart of your share (which maps to earnings) before undelegating.

## Slashing & kicking
#### How and when does slashing occurs? When exactly will operators be slashed?
There are two kinds of slashing events that Operators need to pay attention to. These are "Normal slashing" and "False flag" slashing. The short answer is that normal slashing occurs when nodes are caught being offline or unreachable when they should be online and doing work. It's a similar story for false flag voting, though the penalties are smaller. 

Operator's nodes contain an inspection routine which connects to a target Operator's nodes and checks whether they are relaying data in a given stream. These inspections are validating if the other nodes are doing the promised work. 

Operators will regularly spot check each other with this mechanism. If the inspection fails, Operators raise a flag to the Sponsorship smart contract. A number of random other Operators are selected as reviewers. The reviewers then also inspect the flagged operator for the flagged stream(-partition), and based on their findings they vote via the smart contract on whether to kick (flag was valid) or not to kick (flag was invalid) the flagged operator. If the majority vote is to kick, the flagged operator is slashed. This is described on the Hub as a "Normal slashing" event.

The spot checks are random so there's no hard-and-fast rule such as "be offline for two hours and get slashed". It rather depends on whether you're caught being offline or not. After flagging, there is a review period of one hour. During this hour, the nodes selected as reviewers will make up their minds about the flagged operator, who could come back online during that time. The longer the downtime the more likely it is that the operator will get flagged and slashed.

#### How do I avoid getting slashed?
Running reliable and reachable nodes with good redundancy is the best defense against slashing.

Most operators would set a redundancy Factor parameter to a number more than 1, which means that you have multiple nodes doing the same work. You'd only get slashed if all of them are offline when you're being inspected by the majority of flag reviewers. A higher redundancy factor therefore protects from slashing.

#### What happens to the slashed tokens?
Slashed tokens are sent to a  controlled by Streamr DAO governance.

#### What happens when the Sponsorship is exhausted of tokens, am I still on the hook for slashing penalties until I leave the Sponsorship?
Yes. If you are staked on the Sponsorship, you must do the work (contribute to the stream) and you're subject to slashing if you don't. Sponsorships that you have joined can get topped up so they may activate to start paying out once a sponsor funds the Sponsorship. You must unstake to remove this staking risk. Unstaking does not happen automatically.

#### What are the conditions for getting kicked from a Sponsorship?
If you stake has dropped below the global minimum stake. This can be caused by slashing events against your Operator 

#### I got kicked from a Sponsorship, what happens to me?
You'll no longer be earning from the Sponsorship and no longer required to do the work of the Sponsorship. The unwithdrawn earnings from that Sponsorship are automatically sent out, along with the remaining stake after slashing.

#### I force unstaked from a Sponsorship, what happens?
You'll need to pay the early exit fee of 5k DATA. The unwithdrawn earnings from that Sponsorship are automatically sent out, along with the remaining stake after slashing.

## Safety
#### What are some tips for staying safe on Streamr?
- Consider starting small with your stake amount and use common sense to never stake more than you can afford to lose. A professional audit of the incentive layer has been completed by Cyfrin, but nothing can be guaranteed of course. 
- If you want to stake on a sponsorship, DO NOT click on the "Sponsor". That's for funding the sponsorship, not staking! Instead, go to the sponsorship you want to stake on and click "Join as an operator” and enter the amount. 
- There may be an increase in activity by scammers. A common approach is to pretend to offer help or tech support in direct messages (something we never do). Report any account that is asking you to sign transactions or asking for any sort of credentials such as your private key. These accounts are trying to steal your tokens. It’s advised you disable DMs on Discord. More tips can be found in #server-safety-guide.
