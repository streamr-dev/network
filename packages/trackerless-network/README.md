# Trackerless Network

The Trackerless Network package is a reimplementation of the old (Corea-Brubeck) network package. 
The package is reimplemented to use the network and transport stacks of the proto-rpc and DHT packages.
The main change to the network is that the `d-regular random graph` stream topologies are now generated 
using a decentralized algorithm based on peer discovery from the DHT.
