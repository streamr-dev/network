---
sidebar_position: 4
---

# How to stake and earn

### Background
In Streamr 1.0, the incentivization comes from [stream Sponsorship](../streamr-network/incentives/stream-sponsorships.md) contracts which act as a decentralized mechanism for managing a stream of earnings distributed among a set of [Operators](../streamr-network/network-roles/operators.md). Those Operators run nodes which will join the sponsored stream and help to relay the traffic inside it.

:::info
To earn DATA tokens on Polygon you must be willing to hold and stake DATA tokens on Polygon smart contracts that we call [Sponsorships](../streamr-network/incentives/stream-sponsorships.md). See [how to get DATA](../help/operator-faq.md#how-do-i-get-data-tokens)
:::

### How to participate & earn
1. [Become a node Operator](../guides/become-an-operator.md)
2. Stake your [Operator](../streamr-network/network-roles/operators.md) on [stream Sponsorships](../streamr-network/incentives/stream-sponsorships.md), and/or,
3. [Delegate](../streamr-network/network-roles/delegators.md) your `DATA` tokens onto other Operators

:::info
- **Do NOT** create or sponsor Sponsorships. If you do tokens will be irreversibly sent to that Sponsorship contract. There is no undo for this.
:::

### Sponsorships
Sponsorships are the source of incentivization. These are visible on [The Hub](https://streamr.network/hub/network/sponsorships).

### The Amoy test environment
The [Streamr Hub](https://streamr.network/hub) is the place to test out your Operator before creating it on Polygon with real tokens, just select "Polygon Amoy testnet" from the top-right dropdown.

You'll need Amoy `POL` - widely available with [public faucets](https://faucet.polygon.technology/) and you'll need ` TEST` tokens (the Amoy network's worthless `DATA` tokens) - There is a `TEST` token faucet on the [Streamr Discord](https://discord.gg/gZAm8P7hK8).

### Community resources
- Tutorial videos. Follow at your own risk. Note that version numbers and exact instructions may change over time.
- [StreamrRUN - A Streamr Node in 3 minutes, by Logic Ethos](https://www.youtube.com/watch?v=tGTdaNTtjLY)
- [Manage your Streamr Node in 1 minute, by Logic Ethos](https://www.youtube.com/watch?v=V6yS0bCt13g)
<!-- TODO Autoharvestor https://github.com/Tocard/Streamr_auto_harvest_earning -->

### Safety
**Please be aware of some important safety tips:**

:::info
Your tokens are at risk and [the risks are real!](../streamr-network/network-roles/operators.md#operator-risks).
:::

- Consider starting small with your stake amount and use common sense to never stake more than you can afford to lose. A professional audit of the incentive layer has been completed by Cyfrin, but nothing can be guaranteed of course.
- If you want to stake on a sponsorship, DO NOT click on the "Sponsor". That's for funding the sponsorship, not staking! Instead, go to the sponsorship you want to stake on and click "Join as an operator” and enter the amount.
- There may be an increase in activity by scammers. A common approach is to pretend to offer help or tech support in direct messages (something we never do). Report any account that is asking you to sign transactions or asking for any sort of credentials such as your private key. These accounts are trying to steal your tokens. It’s advised you disable DMs on Discord. More tips can be found in #server-safety-guide.