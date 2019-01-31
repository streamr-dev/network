# Streamr P2P network  ![Travis](https://travis-ci.com/streamr-dev/network.svg?token=qNNVCnYJo1fz18VTNpPZ&branch=master)

# Installation

### Mac OS

#### install brew 
`/usr/bin/ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"`

#### install nvm

`brew update`

`brew doctor`
 
`brew install nvm`

#### install current node lts (v10.15.1)

`nvm install v10.15.1`

`nvm use default v10.15.1`

#### install npm (v6.4.1)

`npm install -g npm@6.7.0`


#### install packages

`npm install`

# run tracker

`npm run tracker`

# run node

`npm run node` - default node with port 30301

or

`npm run node 30302`

`npm run node 30303`

and etc

# run publisher

`npm run pub`

# run subscriber

`npm run sub`

# Debugging
to get all streamr network debug messages `export DEBUG=streamr:*`

to get messages by layers run:

- connection layer `export DEBUG=streamr:connection:*`
- logic layer `export DEBUG=streamr:logic:*`
- protocol layer `export DEBUG=streamr:protocol:*`

to get all debug messages run `export DEBUG=*`

# Testing
run all tests

`npm run test`

run unit tests

`npm run test-unit`

run integration tests

`npm run test-integration`

code coverage

`./node_modules/jest/bin/jest.js --coverage`

run one test

`./node_modules/jest/bin/jest.js ./test/integration/message-duplication.test.js`

# Architecture

The software consist of three layers, which are listed below from the lowest to the highest level.

- _Connection layer_ deals with network-level concerns such as forming connections and sending text/binary messages
over sockets etc. It wraps around a network library (currently libp2p) and provides a library-independent interface for
the higher levels.
- _Protocol layer_ is responsible for encoding messages to be sent via the network, as well as decoding received
messages and interpreting them in terms of higher-level concerns.
- _Logic layer_ is concerned with application-level concerns. It reacts to high-level events emitted from the protocol
layer and pushes new data to the Streamr network via the same layer.

# Flow

### Find node for the stream-id
1. Producer connects to the node
2. Node asks tracker who is responsible for stream.
3. If no one is responsible, then tracker assigns responsibility to this node.

# Glossary
- A _peer_ is any participant in the peer-to-peer network.
- A _tracker_ assists nodes to discover other nodes. Peers can act as trackers, but a tracker might also be a centralised server in some configurations
- A _node_ is a peer that forwards data in the Streamr network pub-sub.
- A _broker_ is a node that also includes client-facing functionality and interfaces.
- A _client_ is an end-user (software) that connects to a broker to use the Streamr network pub-sub.
- A _stream_ is an ordered list of messages uniquely identified by an id (and a partition).
- A _publisher_ is a client that connects to a broker and publishes messages to stream(s).
- A _subscriber_ is a client that connects to a broker and subscribes to the messages of stream(s).
