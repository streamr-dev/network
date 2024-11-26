---
sidebar_position: 2
---

# Stream Sponsorships
Stream Sponsorships are smart contracts for managing a stream of earnings distributed among a set of Operators. Those Operators run nodes which join the sponsored stream and help to relay the traffic inside it. [Sponsors](../network-roles/sponsors.md) create and fund stream Sponsorships and staked [Operators](../network-roles/operators.md) earn from them. 

## The Sponsorship process
Here’s the life cycle of a stream Sponsorship:

1. The Sponsorship contract is created which describes the policies and parameters for how the DATA tokens will be distributed. The headline parameters are:
    - Length of Sponsorship
    - Amount of DATA tokens 
    - Minimum staking duration
    - Minimum number of Operators
2. A Sponsor pays DATA tokens into the Sponsorship smart contract. 
3. Operators join the Sponsorship by staking on it. 
4. Operators’ nodes join the sponsored stream overlay network and relay data in the stream.
5. If/when the Sponsorship runs low on tokens they can be “topped up”, extending the time that the Sponsorship will continue to distribute funds at the configured emission rate.

[Operators](../network-roles/operators.md) can join or leave Sponsorships at any time, subject to conditions like minimum stake and penalties for early withdrawal or misconduct. Under normal conditions their staked DATA tokens are returned in full.

### Earnings split
The proportion of earnings that each Owner-Operator and delegators receive is based on:
- Their indirect stake in the Sponsorship contract
- The **owner's cut** percentage in each Operator that has staked into the Sponsorship

![image](@site/static/img/stream-sponsorship.png)

In this example, the Operator with the smaller **Owner's cut** has attracted more delegation, and thus a larger share of the earnings emitted from the Sponsorship smart contract.

The amount of DATA tokens the Operator stakes on the Sponsorship determines the size of their share of the token flow. The Operator will generally stake on Sponsorships where they can earn the best available yield for their stake. Other Operators in a Sponsorship are there to share the cake, so overcrowded Sponsorships may not offer the best yields, and some Operators will decide to mine other Sponsorships instead. Like any open market, the market of servicing Sponsorships will always gravitate towards achieving equilibrium between supply and demand. Note that the Operator owner earns twice- once for due to their owner's cut and twice due to their own stake in their Operator. 

## Network parameters
### Max queuing time when undelegating
When a delegator chooses to initiate an undelegation process, it's important to consider that the operator might not be able to promptly return the tokens. This delay can occur if the tokens are currently staked within sponsorships.

In such cases, the request for undelegation is placed in a queue, and the operator is granted a specific timeframe, as defined by this parameter, to secure the necessary tokens for repaying the delegator.

Should the operator fail to meet this deadline, they may be unstaked by force from sponsorships in order to free up the required capital. It's worth noting that this timeframe should not be set to a duration shorter than the maximum penalty period specified below.

The max queuing time when undelegating has been set to **30 days** and is subject to change by Streamr DAO governance vote.

### Maximum penalty period
Sponsorship creators have the ability to establish a minimum duration during which operators are required to keep their tokens staked. If operators unstake during this period, their stake is slashed. This parameter sets the longest time that can be chosen as the minimum staking period.

The max queuing time when undelegating has been set to **14 days** and is subject to change by Streamr DAO governance vote.

### Minimum operator’s own stake: 5%
This parameter establishes the mandatory proportion of tokens that operators must stake from their own holdings, as opposed to tokens they can accept via delegation from external sources.

This requirement serves to restrict the extent of leverage through delegation that operators can acquire. To illustrate, if this parameter is set at 5%, it implies that operators staking 5,000 DATA from their own reserves can accept up to 95,000 DATA via delegation.

The minimum operator’s own stake has been set to **5%** and is subject to change by Streamr DAO governance vote.

### Minimum stake
A minimum stake per sponsorship is essential to guarantee that there are sufficient tokens available for rewarding flaggers and reviewers in the event of an operator being penalized for misconduct.

The global minimum stake has been set to **5,000 DATA** and is subject to change by Streamr DAO governance vote.

### Minimum delegation
A minimum delegation amount serves as a protective measure against spamming operators with very small delegations.

The minimum delegation has been set to **5,000 DATA** and is subject to change by Streamr DAO governance vote.

## Stream Sponsorship use cases
Firstly, in situations where data publishers or subscribers can’t be actual nodes in the Streamr Network, for one reason or another, a set of decentralized Streamr nodes can be made available to perform the task of proxying the data from or into the Streamr Network. These nodes can be thought of as proxy or gateway nodes capable of pushing or pulling data into or from an external environment. Sponsorships offers a convenient and practical way of hiring these gateway proxy nodes which are especially useful in resource restricted environments. 

Private communications also come into focus. On Streamr, when end-to-end encryption is activated, message content is indeed private, however, some metadata is still visible—your IP address for example is still visible and in small network topologies it’s possible to match a data publisher with message delivery. However, if the overlay network was boosted with a Sponsorship to increase the node count to, let’s say, thousands of nodes, then any node would be one in a very large crowd. It would be far more difficult to identify a data publisher or subscriber in any meaningful way. Pair this with Streamr’s already decentralized nature and you get a level of anonymity and sovereignty that’s competitive with the most secure and private solutions available on the open internet today.

We can also speculate that Sponsorships will encourage large scale live media streaming on Streamr. For everyone that thought that Streamr was for video streaming, well, they could be right in the end. In Streamr 1.0, there’s no reason why media streams can’t be Streamr streams. Sponsoring a media stream is very likely to bring down the bandwidth costs for streamers that are dependent on exploitive closed platform infrastructure. We’ll have much more to say about this as 1.0 gets closer.

