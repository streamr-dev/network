---
sidebar_position: 1
---

# Network tokenomics
The [DATA](https://etherscan.io/address/0x8f693ca8d21b157107184d29d398a8d082b38b76) token is an ERC-20 token used for project governance, to incentivize node operators on the Network, to delegate stake, and for payments and visibility on the Streamr Hub dApp. The token is native to the Ethereum mainnet and can currently be bridged to Polygon, BNB Chain, and Gnosis Chain - with further multichain support on the horizon. Staking and delegation happens on the Polygon network.

### How the token is used in the Streamr Network
In the Streamr Network, both data publishers and subscribers are nodes in a peer-to-peer network. Nodes involved in a stream of data connect to each other in a certain way – forming the stream’s topology – to perform the main function of the Streamr Network: the dissemination of messages published to that stream.

So every node that joins a stream both consumes data in that stream AND helps relay it onwards to other nodes interested in the stream. Since everyone who uses resources also contributes resources back to the network, can’t the system work _without any token incentives, based on reciprocity alone?_

Under perfect conditions perhaps, yes, but the real world is far from perfect. In practice, the reliability of message passing is reduced by the following

-   **Churn** – Nodes joining and leaving the stream can add instability to the topology, which could disrupt message flow
-   **Free riders** – In a decentralized network, there’s no way to enforce honest behaviour. Some nodes might selfishly consume messages but refuse to propagate them onwards
-   **Malicious nodes** – Some nodes may intentionally try to disrupt the network
-   **Node failures** – Nodes can crash, run out of memory, get overwhelmed with data, get disconnected, experience packet loss, etc.

So, very roughly, what determines the quality of service in a stream’s topology is the ratio of honest, stable nodes vs. nodes that perform questionably. If your use case needs honest, stable nodes to make your data flows more robust, how do you incentivise good nodes to join? Well, you pay them. This forms the basis of the token economics (tokenomics).

Traditional software products often have freemium and paid plans. Decentralized protocols usually have more of a grayscale spectrum as a result of being subject to true market conditions – you pay more for better service. Gas price on Ethereum is a good example: you bid a higher gas price to incentivise miners to execute your transaction faster. A similar economy is at play on Streamr: you pay less (or even nothing) if you’re happy with best-effort performance, while you can pay to incentivise nodes to make your stream more robust and secure.

For the sake of clarity, the Streamr Network tokenomics should not be confused with buying access to data on the Hub. On the Network, people pay for infrastructure costs; for _data delivery_. On the application layer, people pay for access to _data content_. Here’s an analogue: when you order an item from an online store, someone (either you or the store) pays the postal service for _package delivery_. You also pay the online store for the item you ordered, or the _package content_. Note that you can very well use the Network for data delivery without using the Hub at all, just like you can send and receive packages without ordering stuff from online stores.

### The roles in the Streamr tokenomics
Publishers and Subscribers are already familiar roles in the Streamr Network. These roles are only related to the data flows in the network, meaning these roles could be seen as being one layer ‘below’ the tokenomics.

The introduction of token economics defines three new roles: [Sponsor](../network-roles/sponsors.md), [Operator](../network-roles/operators.md), and [Delegator](../network-roles/delegators.md). These roles use DATA tokens to participate in the incentive mechanisms:
* Sponsors fund the network by creating and funding Sponsorship contracts
* Operators run the network and get paid by the Sponsorships; but they can only participate to the extent they have staked DATA tokens to those Sponsorships
* Delegators signal trust in the Operators by funding their stakings.

It should be noted that the roles are independent of each other and can be mixed and matched by all actors depending on their goals, for example, the same person could be a Sponsor, Publisher, and a Delegator.

### Example scenario

There is a stream of data that is important to you. You want to make sure that the data is delivered reliably and securely. You decide to sponsor the stream by creating a Sponsorship contract and funding it with **5000 DATA** tokens, paying out 1 DATA per minute.

Operators stake their DATA tokens to the Sponsorship contract to signal their promise to keep their Streamr nodes online relaying your stream's data. The more DATA tokens an operator stakes, the bigger share they receive from 1 DATA/minute payout. Let's say an operator stakes **50000 DATA** to your Sponsorship contract. These tokens belong to them, and they will receive them back when they leave, as long as they play by the rules. This stake can get slashed if the operator is found to e.g. not have their nodes online.

Every operator may also have delegators that originally gave some of those staked 50000 DATA tokens. Let's say our operator's stakes are funded exactly half by external delegator and half by the operator themselves (**self-delegation**).

After 2000 minutes, our operator withdraws their earnings so far. Those **2000 DATA** are split between stakeholders as follows:
- protocol treasury gets **100 DATA**
- operator gets a cut to cover the cost of operating the nodes, in our example 10%: **199 DATA**
- the remaining **1701 DATA** is split between the operator and external delegators

Summing up:
- The operator gets 50% * 1701 DATA + 199 DATA = **1049.5 DATA** in total
- External delegators get 50% * 1701 DATA = **850.5 DATA** in proportion to their delegation amounts.

After this, the operator will continue to operate the nodes and earn. When they want to leave (e.g. when your Sponsorship runs out of DATA) they will withdraw what they got, unstake their 50000 DATA tokens, and find another Sponsorship to stake them to.

## Technical description

The tokenomics are mainly governed by the following two smart contracts: the Operator contract and the Sponsorship contract. The Operator contract represents an [operator running a Streamr node in the Streamr network](../network-roles/operators.md). The Sponsorship contract holds [the sponsors'](../network-roles/sponsors.md) DATA tokens that `sponsor` a stream, and allocates them as earnings to the staked Operators.

Operator contracts are controlled by their operators. The DATA tokens held by the Operator contract are the funds that the controlling operator can `stake` into whichever Sponsorship contracts they like. By staking into a Sponsorship, the operator commits to servicing the sponsored stream.

The staked operators may `reduceStakeTo` a lower staked DATA amount, or `unstake` entirely. By unstaking they remove their commitment to servicing the sponsored stream.

Operators earn from each "running" Sponsorship contract that they're staked to, and those earnings they can `withdraw`. The withdrawn profits are split between protocol, delegators, and the operator (see [Profit sharing](#profit-sharing)). Some Sponsorship contracts start paying out earnings (*running*) once there are enough operators staked (minOperatorCount), some always pay when there is at least one.

It is for this profit share that [the delegators](../network-roles/delegators.md) will want to `delegate` their DATA tokens to the Operator contract. The operator can then use those delegated tokens to stake more DATA into Sponsorship contracts, increasing their share of the sponsorship earnings.

When a delegator wants to `undelegate` their tokens, they will be added to the undelegation queue. Whenever funds become available, the delegator's DATA tokens are paid back as the first priority. Whether it's DATA from new incoming delegation, withdrawn earnings, or unstaking, the queued delegators are always paid back first, and only then can the operator resume staking DATA into sponsorships.

The delegators can expect to get their tokens back as soon as there is activity in the contract; but at the very latest after [`maxQueueSeconds`](https://polygonscan.com/address/0x869e88dB146ECAF20dDf199a12684cD80c263c8f#readProxyContract) (currently set to 30 days) they can `forceUnstake` the Operator contract's stake from any Sponsorship(s) until their undelegation is paid.

A `forceUnstake` is an exceptional DATA token flow, not pictured in the diagram below. Exhaustive list of minor and exceptional DATA token transfers:
- Forced unstaking related
    - Delegator-initiated after `maxQueueSeconds`, to Operator then to delegator(s) ([source](https://github.com/streamr-dev/network-contracts/blob/master/packages/network-contracts/contracts/OperatorTokenomics/Operator.sol#L441))
    - Operator-initiated: leave penalty for leaving too early, to protocol ([source](https://github.com/streamr-dev/network-contracts/blob/master/packages/network-contracts/contracts/OperatorTokenomics/Sponsorship.sol#L332))
- Flagging, voting, and kicking related
    - stake returned to the Operator that gets kicked out of a Sponsorship (after penalty deducted)
    - reviewer rewards to Operator: peer-reviewing flags results in a small reward when you vote with the majority
    - flagger rewards to Operator: flagging a node that then gets kicked out of a Sponsorship results in a small reward
    - leftover slashings go to protocol: after kicked node gets slashed and rewards paid, there maybe DATA tokens left over that should belong to no one in particular
    - forfeited locked stake to protocol: raising flags then getting kicked out before they resolve (flag-stake forfeited)
- Profit sharing related (see [below section](#profit-sharing) for more details)
    - Protocol fee during profit sharing
    - "fisherman reward" to Operator: finding other Operators that have too much unwithdrawn earnings results getting a share of the profits ([source](https://github.com/streamr-dev/network-contracts/blob/master/packages/network-contracts/contracts/OperatorTokenomics/Operator.sol#L483))

<!-- above list should be exhaustive in order to be a useful reference! If some other flow/transfer is found, add here! -->

![Sponsor's DATA is sent to Operators via withdraws, earnings in Sponsorship contract become profit in Operator contract, profit is shared between delegators](@site/static/img/DATA-flows-high-level.jpg)

### DATA token flows

There are two processes in the normal operation of Streamr tokenomics: the staking process and the delegation process.

Staking process DATA flows:
- Operators send DATA tokens to the Sponsorship contract via [the `stake` method](https://github.com/streamr-dev/network-contracts/blob/master/packages/network-contracts/contracts/OperatorTokenomics/OperatorPolicies/StakeModule.sol#L12)
- Sponsors send DATA tokens to the Operator contract by calling the `sponsor` method, or `transferAndCall`, or simply transferring (not recommended, the system will lose track of who sponsored)
- Every second, the remaining sponsorship is allocated to the Operators in proportion to their stake. The allocation is governed by the [StakeWeightedAllocationPolicy](https://github.com/streamr-dev/network-contracts/blob/master/packages/network-contracts/contracts/OperatorTokenomics/SponsorshipPolicies/StakeWeightedAllocationPolicy.sol), as of 2024 the only available allocation policy
- Sponsorship returns the staked DATA tokens to Operator contract when `reduceStakeTo` or `unstake` is called
    - Unstaking also returns the earnings
- Sponsorship sends DATA token earnings to the Operator contract when `withdraw` is called

Delegation process DATA flows:
- Delegators send DATA tokens to the Operator contract by sending the tokens by calling [the `transferAndCall` method](https://github.com/streamr-dev/DATAv2/blob/main/contracts/DATAv2.sol#L57) or [the `delegate` method](https://github.com/streamr-dev/network-contracts/blob/master/packages/network-contracts/contracts/OperatorTokenomics/Operator.sol#L315)
- When Operator contract receives DATA tokens, if there is a delegator in the undelegation queue, the DATA tokens are sent forward to the delegator
- The DATA tokens the Operator contract receives during `unstake`, `reduceStake`, or `withdraw` calls go through the profit sharing process (see [below section](#profit-sharing))

![Ordinary staking, allocation, and withdrawing; exceptional flagging, voting, and kicking DATA token flows](@site/static/img/DATA-flows-Sponsorship-contract.jpg)

Additionally in the picture you can see the flagging (voting and kicking) process. It provides the smart contract support for the peer-reviewing of the network. The process is not directly related to the tokenomics, but it does cause DATA transfers.

Since the smart contracts can't know about the nodes' performance, the nodes themselves have to [monitor and inspect each other](./node-inspection.md). Reviewer can flag a suspected target. Reviewers who vote with the majority receive a reward. If the vote concludes with "kick", we call the flag successful, and the flagger receives a reward as well. The kicked node loses the [`slashingFraction`](https://polygonscan.com/address/0x869e88dB146ECAF20dDf199a12684cD80c263c8f#readProxyContract) (currently set to 1%) of its stake.

### Profit sharing

Earnings enter the Operator contract during `unstake`, `forceUnstake` and `withdrawEarningsFromSponsorships` method calls. When unstaking, what is returned in addition to the staked DATA tokens are assumed to be the earnings that have accumulated in the Sponsorship contract. When withdrawing, all received DATA tokens are assumed to be earnings.

Earnings are split between stakeholders, for example **2000 DATA** would be split as follows:
- first [`protocolFeeFraction`](https://polygonscan.com/address/0x869e88dB146ECAF20dDf199a12684cD80c263c8f#readProxyContract) (currently set to 5%) is sent to the protocol treasury: **100 DATA**
- then the operator gets their cut, for example 10%: **199 DATA**
- the remaining **1701 DATA** is profit that is split between the delegators (including operator themselves!) in proportion to their stake

Note that the operator gets paid from two sources: the operator cut and the profit share due to self-delegation. So if in the example above the operator had delegated an amount equal to external delegation, the operator's income from the example transaction would in fact be 50% * 1701 DATA + 199 DATA = **1049.5 DATA**.

![Delegated tokens generate profit that is shared between protocol, delegators, and operator](@site/static/img/DATA-flows-Operator-contract.jpg)

What's missing from the picture is the case where the profit sharing was due to a `triggerAnotherOperatorWithdraw` method call into a "fisherman's" Operator contract. The fisherman would receive a reward for finding another Operator that has too much unwithdrawn earnings. The reward is [`fishermanRewardFraction`](https://polygonscan.com/address/0x869e88dB146ECAF20dDf199a12684cD80c263c8f#readProxyContract) (currently set to 25%) of the withdrawn earnings. It's slashed from the operator's self-delegation and transferred to the fisherman's Operator contract.

So the split of **2000 DATA** in case of fisherman-initiated withdraw would be:
- protocol fee: **100 DATA**
- operator's cut: **199 DATA**
- profit: **1701 DATA**
- fisherman's reward: 25% of earnings, or **500 DATA**

And finally the operator's total income would be 1049.5 DATA - 500 DATA = **549.5 DATA**. The fisherman's reward could even take the operator's income negative if the operator's cut is low enough.

### Contract internal bookkeeping

Sponsorship contracts hold different kinds of DATA that are internally kept separate:
- `totalStakedWei`: total amount of tokens staked by all operators
  - each operator has their `stakedWei`, part of which can be `lockedStakeWei` if there are flags on/by them
  - stake belongs to the Operators, they can claim it via `unstake`, `forceUnstake` and `reduceStakeTo` methods
  - the contract can slash the stake for early leaving or getting kicked after a vote
- `remainingWei` that comes from the sponsor: part of the sponsorship that hasn't been paid out yet
  - remaining sponsorship doesn't belong to anybody
  - will be allocated to Operators according to the `StakeWeightedAllocationPolicy` when the contract is running
- `earningsWei`: the part of the sponsorship that has been allocated to Operators but not yet withdrawn
  - belongs to the Operators, they can claim it via `withdraw` method
- `forfeitedStakeWei`: stakes that were locked to pay for a flag by a past operator who `forceUnstake`d (or was kicked)
  - should be zero when there are no active flags

Operator contract holds only "one kind" of DATA but itself functions as a "delegation token" [ERC-20 contract](https://ethereum.org/en/developers/docs/standards/tokens/erc-20/). All DATA the Operator contract holds is considered "free funds" that the operator can use to stake into Sponsorship contracts. The only detail here is that the operator must first pay out the queued delegators (if any), though usually the payouts will happen automatically. Note that the Operator contract's DATA balance does not belong to the operator but to all of the delegators (including the operator via self-delegation) in proportion to their delegation.

The ERC-20 "delegation token" works in a manner similar to a liquidity pool: during delegation, DATA tokens are swapped for newly minted delegation tokens; and undelegation again returns the DATA tokens and burns the corresponding amount of delegation tokens. This exchange rate set by the [`DefaultExchangeRatePolicy`](https://github.com/streamr-dev/network-contracts/blob/master/packages/network-contracts/contracts/OperatorTokenomics/OperatorPolicies/DefaultExchangeRatePolicy.sol) is such that the total supply of operator tokens corresponds to the total amount of DATA tokens either held in the contract or staked in Sponsorship contracts (the `valueWithoutEarnings` of the Operator contract). In the code, it's called "Operator token", and for the most part its existence is hidden from the user interface, APIs and the subgraph schema.

Being an ERC-20, the Operator contract address can be added to wallet and its delegation tokens transferred, albeit with two restrictions: one for the operator and one for the rest of the delegators. The operator's self-delegation must remain above the [`minimumSelfDelegationFraction`](https://polygonscan.com/address/0x869e88dB146ECAF20dDf199a12684cD80c263c8f#readProxyContract) (currently set to 5%) of the total "delegation token" supply. Other delegations must still be above [`minimumDelegationWei`](https://polygonscan.com/address/0x869e88dB146ECAF20dDf199a12684cD80c263c8f#readProxyContract) (currently set to 1 delegation token), or completely undelegate to zero. The value of 1 delegation token starts at 1 DATA, but appreciates as profits accumulate. This limitation prevents rounding error shenanigans in contracts with very low self-delegation.

The outcome of the linear exchange rate between DATA and delegation token is: in the user interfaces we can ignore the delegation token and just convert the values to DATA by simple multiplication. The profits are shared in direct proportion to delegations, much like in Sponsorships where Operators share the continuous sponsorship payment in direct proportion to their stake. Should a non-linear bonding curve be introduced later, the interpretation should remain the same: the value of the delegation tokens is the amount of DATA tokens the delegator would receive after undelegating them. Note that the DATA tokens themselves might not exist in the contract yet, since mostly we expect the Operator contract's value be staked out into Sponsorship contracts. But delegation bookkeeping is still done in the form of the ERC-20 delegation token.

<!-- TODO - re-add these images -->

<!-- <Image
    src={PublisherApp}
    alt="Publisher App"
    figCaption="A publisher app publishes a stream, and their node relays the stream"
/> -->

<!-- <Image
    src={Pic2}
    alt=""
    figCaption="Wanting better service for the stream, a sponsor deploys and funds a Sponsorship in $DATA"
/> -->

<!-- <Image src={Pic3} alt="" figCaption="Streamr nodes watching for bounties stake $DATA and join the stream overlay" /> -->

<!-- <Image src={Pic4} alt="" figCaption="After relaying the stream for an agreed period of time, nodes claim rewards" /> -->

<!-- <Image src={Pic5} alt="" figCaption="Delegators can help streamr nodes join more streams and earn yield on their stake" /> -->
