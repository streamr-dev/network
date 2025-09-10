---
sidebar_position: 8
---

# How to run autostaker plugin

The autostaker plugin assists an operator by automatically selecting
sponsorships to stake in and to unstake from, and by adjusting existing
stakes to reflect the earnings available from sponsorships relative to
other sponsorships. It also makes sure the operator swiftly discovers
and joins new sponsorships as they emerge. This frees the operator from
having to manually monitor and adjust stakes.

To run the autostaker plugin, a user must first be running one or more
operator nodes. See [How to become an Operator](./become-an-operator.md)
for more information.

The autostaker plugin should be enabled on all of your nodes. E.g., say you
are  running 4 nodes in total, each should be configured with autostaker
enabled.

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

In addition, you need to assign the staking agent role to each node's address
so they can adjust stakes on behalf of the operator. See [Staking agents](../streamr-network/network-roles/operators.md#staking-agents)
for how this is done.

![Setting staking agent role in the Hub](@site/static/img/staking-agent-selector-in-hub.png)

:::info
- When choosing to run the autostaker plugin, the user should not manually adjust
their operator's stakes, e.g. via the Hub. The autostaker will most likely undo
any manual changes by returning the stakes back to the state it considers optimal.
- To withdraw earnings while the autostaker is enabled, you simply
initiate a withdraw and wait for the undelegation queue to be processed by the
autostaker. This will not be immediate, but will happen on the next activation
of the autostaker (by default every 60 minutes).
:::


## Autostaker configuration options

The following config options are all _optional_. If not provided, the autostaker
will run with default values.

- The integer `maxSponsorshipCount` controls how many sponsorships the autostaker
will stake into at most. The larger the capacity of your operator fleet state is
(in terms of node count / CPU / bandwidth) the higher this number can be. Conversely,
if your operator fleet is small, this integer should be kept low.
- The integer `minTransactionDataTokenAmount` controls the minimum value a transaction must be
to be considered for execution. The value is expressed in $DATA tokens. Any transactions
falling below this value will be skipped. This is to avoid executing transactions that are
too small in value. To choose this value, balance the cost of gas vs. the value gained by
staking the amount optimally. (The exception to this config is expired sponsorships, which
will always be unstaked from regardless.)
- The integer `maxAcceptableMinOperatorCount` is used to decide whether to stake into a
sponsorship that has a minimum operator count requirement. Such sponsorships only start
paying out once the minimum operator count is reached. E.g. if a sponsorship has a minimum
operator count of 20, and this is set to 20, the autostaker will stake into it. If it is set to
10, the autostaker will not stake into it. (The check is static and does not consider how many
operators may currently already be staked into such a sponsorship.)
- The integer `runIntervalInMs` controls how often the autostaker will run its logic. In
addition to time-based runs, the autostaker will also run whenever a new sponsorship is
created.

Example of setting these values (default values):
```json
{
  "plugins": {
    "autostaker": {
      "operatorContractAddress": "<OPERATOR_ADDRESS>",
      "maxSponsorshipCount": 25,
      "minTransactionDataTokenAmount": 1000,
      "maxAcceptableMinOperatorCount": 50,
      "runIntervalInMs": 3600000
    }
  }
}
```