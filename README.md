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

# TODO

- disconnection
- validation
- tests
- async
