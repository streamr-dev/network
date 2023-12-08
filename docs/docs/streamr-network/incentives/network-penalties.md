---
sidebar_position: 3
---

# Network penalties
Node Operators promise to deliver, but what happens if they break that promise? Well, they will lose some of their staked DATA tokens in a process that’s commonly referred to as “slashing”. Delegators are also at risk of losing value if they delegate to unreliable Operators. Read more on the bigger picture of [network incentives](./network-incentives.md).

## Normal slashing
Operators will lose **10%** of their staked tokens if they are found to be violating protocol rules while engaged in a stream Sponsorship. The most likely scenario for slashing is the Operator doesn't have any online nodes to support the sponsored stream that they have promised to join and relay data on. 

To avoid being slashed ensure that your node is connectable and up to the challenge of distributing data on the sponsored stream. Running [redundant nodes](../network-roles/operators#node-redundancy-factor) is an excellent way to protect yourself against slashing.

## False flag slashing
Nodes regularly spot test each other in Sponsorships, and raise flags if they think another Operator is not online and doing the work. A flag stake is placed to back up the claim. A number of reviewers are selected to validate the flag by also testing the flagged Operator and voting.
The flagger loses the flag stake due to a false flag when the majority of flag reviewers vote that the flagged Operator is actually fine, and the flag was therefore deemed invalid.
See node inspections for more information on the node flagging process and parameters.

See [node inspections](./node-inspection.md) for more information on the node flagging process and parameters.

## Prematurely leaving a Sponsorship
If an Operator decides to unstake from a Sponsorship before the agreed staking duration has expired then they will have to pay a 5k DATA token penalty.
