---
sidebar_position: 1
---

# Developer FAQ

### Is Streamr a Blockchain?
No, Streamr is a network of nodes that pipe messages to one another, like BitTorrent but for real-time data streams.

### Does Streamr use a Blockchain?
Yes, the stream registry, access control polices and incentive mechanisms are EVM contracts on Polygon.

### Is Streamr secure?
Yes. Every data point is cryptographically signed and the data is end to end encrypted.

### Is Streamr free to use?
Yes, it's powered by a P2P network of reciprocity and messages are not rate limited. There is no cost per message enforced. You will need to pay a cent or two for creating streams on-chain and if you want to improve the quality of your service, then DATA tokens are required to incentivize nodes to join your stream.

### How fast and scalable is the Network?
On some of the largest streams, messages reach all interested subscribers within a third of a second.

### What is the DATA token used for?
DATA is the currency of the incentive layer of the Network. Its used to improve stream security, scalability and privacy.

### Do you have a Python SDK?
Just JavaScript at the moment. But you can interact with the Network by running a Broker node, then interacting with it via WebSockets, MQTT or HTTP in any language.

### Does Streamr store data?
Yes, but currently in a centralized way, using Streamr Storage nodes. There are ecosystem and community efforts underway to bridge the Streamr Network's data transport capabilities with decentralized data storage.

### What kind of messages and data can the Network transport?
The Network transports JSON messages only. Full binary support is coming in H2 2023.