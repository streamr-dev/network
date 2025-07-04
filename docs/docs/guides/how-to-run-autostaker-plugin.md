---
sidebar_position: 8
---

# How to run autostaker plugin

The autostaker plugin assists an operator by automatically selecting the
sponsorships to stake in and to unstake from, and by adjusting existing
stakes to reflect the earnings available from sponsorships relative to
other sponsorships. It also makes sure the operator's nodes discover
new sponsorships opportunities in a timely manner.

To run the autostaker plugin, a user must first be running one or more
operator nodes. See [How to become an Operator](./become-an-operator.md)
for more information.

The autostaker plugin should be configured per operator node, e.g., say
you are running 4 nodes, you need to configure each to use the autostaker
plugin.

The autostaker plugin is enabled by adding the following section to your node
configuration (under the plugins section):
```json
{
  "plugins": {
    "autostaker": {
      "operatorContractAddress": "<OPERATOR_ADDRESS>"
    }
  }
}
```

In addition, you need to assign the staking agent (or `CONTROLLER`) role for each nodes' wallet
so they can adjust stakes on behalf of the operator. See [Staking angets](../streamr-network/network-roles/operators.md#staking-agents)
for how this is done.
