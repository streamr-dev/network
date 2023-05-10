---
sidebar_position: 1
---

# What is the Streamr Network

The Streamr Network is a peer-to-peer network for publishing and subscribing to data in real-time. Applications use it for _decentralized messaging_, for example sharing data across applications or broadcasting real-time state changes to large audiences. The decentralized nature of the system makes the data transport scalable, robust, secure, tamper proof, and censorship resistant.

The Streamr Network consists of _nodes_ that interconnect peer-to-peer using the Streamr protocol. Together, the nodes in the Network form a topic-based publish-subscribe messaging system. Topics in this messaging system are called streams. The job of the Network is to deliver published streams of messages to all subscribers of that stream.

The Streamr Network is a building block for decentralized applications - a message transport middleware, enabling any number of parties to distribute or exchange information without directly coupling or relying on a central server to broker data.

All of the data in the Streamr network is contained inside individual [streams](../usage/streams/creating-streams). The data may originate, for example from your app, machines on the factory floor, sensors in a smart city, in-house databases or systems, or from commercial streaming data feeds.

For further reading, checkout the [light paper](https://streamr.network/lightpaper) and [Network white paper](https://streamr.network/network-whitepaper).

### Explore the Network

The network is highly dynamic, with a regular cast of broker nodes, but also a constantly revolving number of light nodes appearing and disappearing. The <a target="_blank" rel="noopener noreferrer" href="https://streamr.network/network-explorer">Network Explorer</a> is an application that brings visibility to the stream topologies inside the Streamr Network. Being able to explore it helps node runners inspect their nodes and diagnose any issues.

You can search for areas, say all nodes in Helsinki, streams by path name or description, as well as specific nodes by generated name or Ethereum address. By searching or selecting a stream, the nodes participating in the stream overlay will be shown in both the results list, and on the geo map. Selecting a node in this list gives you access to all the metrics, and as the full tokenomics rolls out in Tatum milestone, will also give access to the node’s Ethereum address, and link out to its transaction history on Etherscan.
