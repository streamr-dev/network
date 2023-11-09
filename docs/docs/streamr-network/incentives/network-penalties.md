---
sidebar_position: 3
---

# Network penalties
Penalties are required to keep node operators honest.

## Normal slashing
Operators promise to deliver, but what happens if they break that promise? Well, they will lose some of their staked DATA tokens in a process that’s commonly referred to as “slashing”. Delegators are also at risk of losing value if they delegate to unreliable Operators.

Operators will lose **10%** of their staked tokens if they are found to be violating protocol rules while engaged in a stream Sponsorship. The same penalty applies if Operators decide to unstake from a Sponsorship prematurely.

To avoid being slashed ensure that your node is connectable and up to the challenge of distributing data on the sponsored stream. Running [redundanct nodes](../network-roles/operators#node-redundancy-factor) is an excellent way to protect yourself against slashing.

## False flag slashing
Nodes spot test each other in Sponsorships. A false flag slashing happens when a node that votes in the minority of the reviewing nodes.

For example, 7 nodes spot test a node. If you vote "no" and the other 6 vote "yes" then you will receive a small penalty. Voting incorrectly may indicate a problem with your node's connectivity.

See [node inspections](./node-inspection.md) for more information on the node flagging process and parameters.
