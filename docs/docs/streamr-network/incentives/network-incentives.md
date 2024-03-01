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

The introduction of token economics defines three new roles: [Sponsor](../network-roles/sponsors.md), [Operator](../network-roles/operators.md), and [Delegator](../network-roles/delegators.md). These roles use DATA tokens to participate in the incentive mechanisms.

It should be noted that the roles are independent of each other and can be mixed and matched by all actors depending on their goals, for example, the same person could be a Sponsor, Publisher, and a Delegator.

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
