---
sidebar_position: 1
---

# Streamr 1.0 Testnets
### Background
The 1.0 incentivized testnet events will run from November, 2023 till January, 2024. In the [Brubeck testnets](https://blog.streamr.network/streamr-testnet-review/) of 2022, we tested the [scalability of the Streamr Network](https://blog.streamr.network/a-technical-deep-dive-into-the-results-of-the-brubeck-testnet/). In the 1.0 Streamr milestone we are testing the decentralized incentive layer of the network.

If you’ve been running a Streamr node in the past you might be familiar with a two step process– run some software, stake some tokens, i.e. a software step and a blockchain step. The Streamr centralized backend would validate user’s stake and transfer reward tokens to node runner wallets at the end of each month. This has worked, but it has never been the long term intention to run Streamr this way. In these testnets and generally in Streamr 1.0, the incentivization comes from [stream Sponsorship](../streamr-network/incentives/stream-sponsorships.md) contracts which act as a decentralized mechanism for managing a stream of earnings distributed among a set of [Operators](../streamr-network/network-roles/operators.md). Those Operators run nodes which will join the sponsored stream and help to relay the traffic inside it.

The 1.0 testnets will be launched with the technical parameters set out in: [SIP-16](https://snapshot.org/#/streamr.eth/proposal/0xf95e691103efc4ce9ebd2ed22da3df6df446f982e6e34df1180a9a5366b3060f)

### How to participate & earn
1. [Become a node Operator](../guides/become-an-operator.md)
2. Stake your [Operator](../streamr-network/network-roles/operators.md) on [stream Sponsorships](../streamr-network/incentives/stream-sponsorships.md), and/or,
3. [Delegate](../streamr-network/network-roles/delegators.md) your `DATA` tokens onto other Operators

## Current node software version
Use node version: `v100.0.0-testnet-one.0`. Do not use the `latest` tag release.

## Schedules
Keep a close eye on this page as these dates may change based on the findings of each testnet.

### Mumbai Operator testing (the pre-testnet)
- Live! Checkout the [Mumbai Streamr Hub](https://mumbai.streamr.network)

### Testnet 1
- Start date: 4PM CET / 15:00 UTC, 4th December to 11th December
- Reward pool: 1 million DATA
- Duration: 7 days
- **Testnet 1 will have reduced slashing penalties of 1% instead of 10%**

### Testnet 2
- Start date: 18th December to 8th January
- Reward pool: 1.5 million DATA
- Duration: 21 days

### Testnet 3
- Start date: 15th January to 29th January
- Reward pool: 2.5 million DATA
- Duration: 14 days

### Testnet Sponsorships
Each testnet will have a set of Sponsorships that will be the source of incentivization. These will be visible on [The Hub](https://streamr.network/hub/network) (release TBA).

### The Mumbai test environment
The [Mumbai Hub](https://mumbai.streamr.network) is the place to test out your Operator before creating it on Polygon with real tokens.

You'll need Mumbai `MATIC` - widely available with [public faucets](https://mumbaifaucet.com) and you'll need ` TEST` tokens (the Mumbai network's worthless `DATA` tokens) - There is a `TEST` token faucet on the [Streamr Discord](https://discord.gg/gZAm8P7hK8).

**What are the differences between the "pretestnet" and Testnet 1?**
This `v100.0.0-testnet-one.0` version can be used to connect to Testnet 1 **or** the Mumbai pre-testnet. 

The active network depends on the node config. The [Mumbai node config](../guides/become-an-operator#the-mumbai-test-environment) is unchanged. The [Testnet 1 config](../guides/become-an-operator#testnet-node-config) is a much shorter version.

Don’t use the `pretestnet` releases anymore.

![image](@site/static/img/mumbai-to-testnet.jpg)

### Community resources
- Tutorial videos. Follow at your own risk. Note that version numbers and exact instructions may change over time.
- [StreamrRUN - A Streamr Node in 3 minutes, by Logic Ethos](https://www.youtube.com/watch?v=tGTdaNTtjLY)
- [Manage your Streamr Node in 1 minute, by Logic Ethos](https://www.youtube.com/watch?v=V6yS0bCt13g)

### Bounty prizes
We're offering DATA prizes for quality contributions to the following categories:
- On-chain metric dashboards
- Fine grained monitoring tools such as email notifications

### Safety
Your tokens are at risk by participating in these testnets - [the risks are real](../streamr-network/network-roles/operators#operator-risks).

Please do not engage with any accounts claiming to be Support, Admin or Help. Report any account that is asking you to sign transactions or asking for any sort of credentials such as your private key. These accounts are trying to steal your tokens.
