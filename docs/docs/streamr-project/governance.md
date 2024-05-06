---
sidebar_position: 3
---

# Governance
The Streamr project and network are governed by the `DATA` token holders. Token holders have a clear and direct impact on the direction of the project since decentralized governance allows anyone with a stake in the project to contribute to steering it, enabling the wisdom of the crowd to kick in and push the project towards the best long-term outcomes. Since February 2021, holders of DATA, the utility token that powers the Streamr ecosystem, have been able to vote on Streamr protocol governance decisions.

## Streamr Improvement Proposals (SIPs)
SIPs are the process for making meaningful decisions inside the Streamr project. A SIPs typical voting period is 5 to 7 days and they usually follow this format:
- A description of the proposal
- The case against the proposal
- The case for the proposal

Voting options should be "for" or "against", though sometimes its suitable to offer a range of options, albeit at increasing the voter spread.

## Types of SIPs
The kinds of SIPs token holders decide on range from:
- Technical network parameters,
- Monetary/economic policies,
- Strategic roadmap steering, and,
- Ecosystem funding.

At the technical network level, aspects of the network such as [node inspection parameters](../streamr-network/incentives/node-inspection.md) and [node penalty parameters](../streamr-network/incentives/network-penalties.md) are decided by SIPs. For example, [SIP-20: Modifications to planned 1.0 mainnet parameters](https://snapshot.org/#/streamr.eth/proposal/0x12f43b57d6f636875197bbadfff2b75de05bf866332353aa0cf11b993aaffc5d). There are examples of all types of SIPs inside the [Streamr Snapshot](https://snapshot.org/#/streamr.eth)

### How can I make a SIP?
To combat spam/abuse, the Snapshot proposal gateway is currently in a restricted mode. To start your SIP, begin with a draft shared on the `#governance` [Streamr Discord server](https://discord.gg/gZAm8P7hK8).

## Voter eligibility
To be eligible to vote you must either be an Operator in the Network with a stake, or control an Ethereum account that holds `DATA` tokens on one of the supported chains, listed here: 
- Ethereum: `0x8f693ca8D21b157107184d29D398A8D082b38b76`
- Polygon POS: `0x3a9A81d576d83FF21f26f325066054540720fC34`
- Gnosis Chain: `0x256eb8a51f382650B2A1e946b8811953640ee47D` 
- Binance Smart Chain: `0x0864c156b3C5F69824564dEC60c629aE6401bf2a`

You cannot vote with tokens held on a centralized exchange or tokens that are providing liquidity on a decentralized exchange.

### Voting through your Operator
If you run an [Operator](../streamr-network/network-roles/operators.md) on the Streamr Network, your voting power is your total stake of `DATA` tokens. Your total stake is the sum total of your funded amount, and the delegated `DATA` tokens. Delegating to other Operators gives those Operators your voting power.

### Voting on a SIP
The token balances at the SIPs “snapshot block” will determine your voting power. Right after the snapshot block you are free to move your tokens out of your wallet – this won’t affect your ability to vote. 

Voting on Snapshot will not require any gas- only a signed message is required. We recommend the MetaMask wallet for interacting with the voting UI. Snapshot also supports WalletConnect, Fortmatic, Coinbase, and Torus.
