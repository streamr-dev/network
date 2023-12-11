---
sidebar_position: 2
---

# Operators
:::info
For instructions on becoming an Operator, check out [this guide](../../guides/become-an-operator.md).
:::

Operators are the node running "miners" in the Streamr Network. To be specific– Operators are the persons/entities that operate (own/control) Streamr nodes. They choose which Sponsorships they want to stake DATA on, and run a fleet of Streamr nodes to do the work of relaying the data in related streams. The promise of Operators is: _"I run honest and stable nodes, and my nodes will join the stream topologies to help stabilise and secure them"._ An Operator's nodes don’t subscribe to a stream because they’re interested in the data, they join because they want to earn a share of the DATA tokens flowing through a Sponsorship. The Operator can claim their rewards at any time, to withdraw earned tokens from the Sponsorship contract.

Operators have an owner address and private key, and (once deployed) they will have an Operator contract address. The address/key pair is Ethereum based and is the same on all Ethereum-compatible chains. All Streamr contracts are deployed on the Polygon blockchain.

An Operator's nodes are expected to be honest and to follow the protocol rule of properly forwarding messages to other connected nodes. They are also expected to be stable, with good uptime along with sufficient bandwidth and hardware resources to handle the traffic of the incentivized streams. If the Operator fails to meet these standards, they could be kicked out of the Sponsorship and their stake could be slashed.

The amount of DATA tokens the Operator stakes on the Sponsorship determines the size of their share of the token flow. The Operator will generally stake on Sponsorships where they can earn the best available yield for their stake. Other Operators in a Sponsorship are there to share the cake, so overcrowded Sponsorships may not offer the best yields, and some Operators will decide to mine other Sponsorships instead. Like any open market, the market of servicing Sponsorships will always gravitate towards achieving equilibrium between supply and demand.

## The Operator contract
Operators represent themselves on-chain with an Operator smart contract and it’s this contract that’s used to join and stake on [Sponsorships](../incentives/stream-sponsorships.md). In order to stake on Sponsorships and start earning, the Operators fund their Operator contract (technically, self-delegate) and also potentially accept delegations from external Delegators, with whom they then share revenue. The Operator contract is also the exit point for earnings and delegated tokens.

Operators can join or leave Sponsorships at any time, subject to conditions like minimum stake and penalties for early withdrawal or misconduct. Under normal conditions their staked DATA tokens are returned in full.

### Streamr node interactions
The "leader" node in the Operator's fleet of Streamr nodes will send heartbeat transactions once per day to the Operator contract. The transaction includes the contact details for the node.

When new nodes want to join the network, they need to find someone already in the network. The purpose of the heartbeat process is to maintain publicly discoverable contact details for a decentralized set of nodes, so that joining the network doesn't need to rely on a hard-coded centralized entrypoint.

### The Operator plugin
The Operator plugin is packed with the Streamr node software. It’s essential that Operators run this plugin (or build a functional equivalent) to be able to join Sponsorships and participate on the Streamr Network incentive layer.

![image](@site/static/img/operator-flows.png)
The Operator plugin interfaces with the Network and the Operator contract, which is connected to Sponsorship smart contracts.

The Operator plugin will automatically validate that other Operators are doing work in the Sponsorship by conducting randomized spot tests, raising flags when appropriate, and voting on flags raised by other Operators that are also validating work on the Network.

![image](@site/static/img/operator-sponsorship-relational-diagram.png)

### Operator heartbeat
To observe your Operator's heartbeat, paste in your Operator contract address into [streams search](https://streamr.network/hub/streams) and select the coordination stream, then "Live data". If your node is connectable then there will be a "websocket entry" inside the peer descriptor heartbeats. 

:::info Important
- There's a known connectivity issue using Brave browser. Your node connectivity status may report incorrectly on the Streamr Hub.
:::

### Node redundancy factor
The redundancy factor sets the amount of duplicated work when running a fleet of multiple nodes. Doing redundant work protects against slashing in case some of your nodes experience failures. For example, setting this to 1 means that no duplication of work occurs (the feature is off), and setting it to 2 means that each stream assignment will be worked on by 2 nodes in your fleet.

### Owner's cut
The Operator’s cut is the percentage taken by the Operator from all earnings. This percentage can be changed, but only while the Operator is not staked in any Sponsorships. The remainder percentage is shared among all Delegators, including the Operator's own stake wich must be at least [5% of the total delegations amount][../incentives/stream-sponsorships.md].

### Operator maintenance
#### Operator uncollected earnings limit
Operators continuously earn rewards from Sponsorships on every block. For the Operator’s total value to be correctly reflected on-chain, those earnings must be periodically collected to limit the error between the recorded on-chain value and the ‘real-time’ value of the Operator, which constantly changes due to uncollected earnings accumulating.

Normally, the node software handles this earnings collection and maintenance of Operator value automatically. The Operator is responsible for ensuring that this happens by ensuring their nodes are running and the wallets of their nodes have enough `MATIC` to pay gas for transactions.

The uncollected earnings limit has been set to 5% and this value is subject to change by Streamr DAO governance vote.

#### Fisherman’s reward
If the amount of uncollected earnings exceed the Operator’s recorded value by more than the uncollected earnings limit (5%), any entity can demonstrate to the Operator smart contract that the values are outside acceptable limits. The party providing such proof (a ‘fisherman’) is rewarded, and the Operator who violated this margin loses a portion of their uncollected earnings. This mechanism helps maintain the accuracy and integrity of the on-chain value, protecting the interests of participants in the protocol.

If it is demonstrated that an Operator’s uncollected earnings exceed the above margin, the ‘fisherman’ providing the proof is entitled to a share of the operator's uncollected earnings that were included in the proof. Importantly, only the Operator who violated the error margin loses a portion of their earnings. This mechanism ensures that the consequences of inactivity are borne by the responsible Operator.

This reward is set to 25% and this value is subject to change by Streamr DAO governance vote.

### Network validation
Streamr nodes are also the validators in the Streamr Network. They inspect and validate that other nodes in the same [sponsored stream] are doing the work
If an operator fails completely (all their nodes go offline), they will eventually get flagged in all the sponsorships where they are staked. So yes more Sponsorships means more flagging in this case.

If the flags are raised by the random inspection process, it's likely that the flags will be raised evenly by all the other operators, so no one operator's MATIC balance gets a major unexpected drain.

By default, nodes inspect each other quite lazily (pick one operator-sponsorship-partition triplet every 15 minutes). However, correctly flagging and voting is profitable, so more 'eager' flaggers might appear in the network, with smarter inspection strategies - for example if a node gets slashed in one sponsorship, it might be worthwhile for someone to inspect them in all their other sponsorships too, and raise flags if the inspection fails.
How to earn DATA tokens by being an Operator
[DATA tokens] are the native currency of the Streamr Network. As an Operator, you can earn DATA tokens by running nodes and joining Sponsorships that promise your node’s abilities towards relaying data on the sponsored stream.

### Operator risks
Operators promise to deliver, but what happens if they break that promise? Well, they will lose some of their staked DATA tokens in a process that’s commonly referred to as “slashing”. Delegators are also at risk of losing value if they delegate to unreliable Operators.

Under the hood, Operators are running an [Operator plugin](#the-operator-plugin) on their Streamr Nodes. This plugin is continuously validating other nodes’ activity on the Streamr Network, and based on their findings they can raise flags, and vote on flags if selected as voters through a random selection. Operators that are found to have violated protocol rules are slashed, meaning that they lose some fraction of their committed stake.

While the above processes and roles may seem quite straightforward, one of the key challenges is preventing Operators that don’t actually do the work (of joining the stream’s topology and relaying messages to connected peers) from earning tokens from Sponsorships.

Since Operators place a stake on Sponsorships, their stake can be slashed for not doing the work. All Operators' nodes validate other Operators' nodes by carrying out inspections (i.e. spot checks) to ensure that everyone is doing the work appropriately. If someone is suspected of misbehavior, they are flagged to the Sponsorship smart contract by the inspecting node. The smart contract selects random Operators from the Network to run their own inspection on the flagged Operator and vote whether the flagging was valid. If the flag is deemed valid, the flagged Operator is slashed and the flagger is rewarded. If the flag is invalid, the flagger is punished instead.
