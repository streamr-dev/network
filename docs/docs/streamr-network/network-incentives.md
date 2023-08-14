---
sidebar_position: 4
---

# Network incentives
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

The introduction of token economics defines three new roles: Sponsor, Operator, and Delegator. These roles use DATA tokens to participate in the incentive mechanisms.

It should be noted that the roles are independent of each other and can be mixed and matched by all actors depending on their goals, for example, the same person could be a Sponsor, Publisher, and a Delegator.

<!-- TODO - re-add these images -->

<!-- <Image
    src={PublisherApp}
    alt="Publisher App"
    figCaption="A publisher app publishes a stream, and their node relays the stream"
/> -->

#### Publisher
A Publisher is simply a node through which certain data enters the network. The data usually originates in an adjacent application that interfaces with the Publisher node, with the goal of delivering that data to Subscribers via the network. Publisher nodes relay the messages to other nodes they are connected to.

#### Subscriber
A Subscriber is a node in the network that wants to receive messages from a stream. Just like Publishers, they also relay the messages to other nodes they are connected to (this is why the Network scales so well). Subscribers may have a range of different motivations for joining a stream – there could be an adjacent application that wants the data, they could be Operator nodes that relay the stream for rewards (see below), or they may even want to help the stream for charitable reasons.

<!-- <Image
    src={Pic2}
    alt=""
    figCaption="Wanting better service for the stream, a sponsor deploys and funds a Bounty in $DATA"
/> -->

#### Sponsor
Sponsors pay to secure the operation of a stream. They pay DATA tokens into a smart contract called a Sponsorship. Essentially, the Sponsor says _“I want to spend X amount of DATA tokens over a period of time T to improve the security and stability of stream S”._ The sponsorship contract releases the funds over time to Brokers who are mining the Bounty (see below to learn about Brokers). It should be noted that a stream can have many Sponsors, and they could be anyone at all, including the Publisher(s), Subscribers, or a third party.

<!-- <Image src={Pic3} alt="" figCaption="Broker nodes watching for bounties stake $DATA and join the stream overlay" /> -->

#### Operator
Operators are the "miners" in the Streamr Network. They choose which Sponsorships they want to stake DATA on, and run a fleet of Streamr nodes to do the work of relaying the data in related streams. The promise of Operators is: _"I run honest and stable nodes, and my nodes will join the stream topologies to help stabilise and secure them"._ An Operator's nodes don’t subscribe to a stream because they’re interested in the data, they join because they want to earn a share of the DATA tokens flowing through a Sponsorship. The Operator can claim their rewards periodically to withdraw earned tokens from the Sponsorship contract.

<!-- <Image src={Pic4} alt="" figCaption="After relaying the stream for an agreed period of time, nodes claim rewards" /> -->

An Operator's nodes are expected to be honest and to follow the protocol rule of properly forwarding messages to other connected nodes. They are also expected to be stable, with good uptime along with sufficient bandwidth and hardware resources to handle the traffic of the incentivized streams. If the Operator fails to meet these standards, they could be kicked out of the Sponsorship and their stake could be slashed.

The amount of DATA tokens the Operator stakes on the Sponsorship determines the size of their share of the token flow. The Operator will generally stake on Sponsorships where they can earn the best available yield for their stake. Other Operators in a Sponsorship are there to share the cake, so overcrowded Sponsorships may not offer the best yields, and some Operators will decide to mine other Sponsorships instead. Like any open market, the market of servicing Sponsorships will always gravitate towards achieving equilibrium between supply and demand.

<!-- <Image src={Pic5} alt="" figCaption="Delegators can help brokers join more streams and earn yield on their stake" /> -->

#### Delegator
Delegators are DATA token holders who don’t want to be run nodes and be Operators themselves, but would rather earn by delegating their tokens to Operators and sharing the revenue from their work. In exchange, they earn a share of the Operator's rewards. Since Operators need to stake tokens to mine Sponsorships, having access to tokens from Delegators enables them to earn more, creating a win-win situation. 

Delegators select Operators to stake on and deposit tokens into their Operator smart contract. The funds in the contract can then be used by the Operator for staking on Sponsorships. Operators can freely determine the cut they take from the revenue enabled by the Delegators' funds, creating a competitive market for Delegator money.

### Slashing
While the above processes and roles may seem quite straightforward, one of the key challenges is preventing Operators that don’t actually do the work (of joining the stream’s topology and relaying messages to connected peers) from earning tokens from Sponsorships.

Since Operators place a stake on Sponsorships, their stake can be slashed for not doing the work. All Operators' nodes validate other Operators' nodes by carrying out inspections (i.e. spot checks) to ensure that everyone is doing the work appropriately. If someone is suspected of misbehavior, they are flagged to the Sponsorship smart contract by the inspecting node. The smart contract selects random Operators from the Network to run their own inspection on the flagged Operator and vote whether the flagging was valid. If the flag is deemed valid, the flagged Operator is slashed and the flagger is rewarded. If the flag is invalid, the flagger is punished instead.
