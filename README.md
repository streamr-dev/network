# network

Streamr P2P network

# install

npm install

# run tracker

`npm run tracker`

# run node

`npm run node` - default node with port 30301

or

`npm run node 30302`

`npm run node 30303`

and etc

# run publisher-libp2p

`npm run pub-libp2p port libp2p-address streamId`

example:

`npm run pub-libp2p 30310 /ip4/127.0.0.1/tcp/30301/ipfs/QmSfv54RY4v1tzJbQgkZbJzuFggYfJTnY8C2sZLafWkrWN 5637cf21-b286-11e8-8f3e-8b5d43958c3e`

# run publisher

`npm run pub port libp2p-address streamId`

example:

`npm run pub 30310 /ip4/127.0.0.1/tcp/30301/ipfs/QmSfv54RY4v1tzJbQgkZbJzuFggYfJTnY8C2sZLafWkrWN 5637cf21-b286-11e8-8f3e-8b5d43958c3e`

# Debugging
to get all debug messages run `export DEBUG=*`

to get all streamr network debug messages `export DEBUG=streamr:`

to get messages by layers run:

- connection layer `export DEBUG=streamr:connection*`
- logic layer `export DEBUG=streamr:logic*`
- protocol layer `export DEBUG=streamr:protocol*`

# Testing
run tests

`npm test`

code coverage

`./node_modules/jest/bin/jest.js --coverage --collectCoverageFrom=src/**/*.js`

run one test

`./node_modules/jest/bin/jest.js test/integration/publisher.test.js`

### node
it's better to run integration tests one by one, for now they are using the same port for tracker, so it can cause `listen EADDRINUSE` errors  

# TODO

- proper disconnection with blocking message sending
- validation
- tests
- async

# Architecture

The software consist of three layers, which are listed below from the lowest to the highest level.

- _Connection layer_ deals with network-level concerns such as forming connections and sending text/binary messages
over sockets etc. It wraps around a network library (currently libp2p) and provides a library-independent interface for
the higher levels.
- _Protocol layer_ is responsible for encoding messages to be sent via the network, as well as decoding received
messages and interpreting them in terms of higher-level concerns.
- _Logic layer_ is concerned with application-level concerns. It reacts to high-level events emitted from the protocol
layer and pushes new data to the Streamr network via the same layer.

# Glossary
- A _peer_ is any participant in the peer-to-peer network.
- A _node_ is a peer that forwards data in the Streamr network pub-sub.
- A _tracker_ is a peer that assists nodes to discover other nodes.