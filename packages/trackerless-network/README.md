# Trackerless Network

A P2P topic publish-subscribe network.

The Trackerless Network package is a reimplementation of the old (Corea-Brubeck) network package. 
The package is reimplemented to use the network and transport stacks of the proto-rpc and DHT packages.
The main change to the network is that the `d-regular random graph` stream topologies are now generated 
using a decentralized algorithm based on peer discovery from the DHT.

## Running a node

Running a network node requires a DhtNode from the `@streamr/dht` to use as control layer. For more details on how to configure the DHT node go [here](packages/dht/README.md) The control layer node is configured as follows:

```js
const networkNode = new NetworkNode({
    // Give all control layer DHT configs here.
    layer0: {

    },
    // Content layer specific configurations:
    networkNode: {

    }
})
await networkNode.start()
```

### Publishing messages

```js
const streamPartId = StreamPartIDUtils.parse('test#0')
const message = new StreamMessage({
    messageId: new MessageID(
        StreamPartIDUtils.getStreamID(streamPartId),
        StreamPartIDUtils.getStreamPartition(streamPartId),
        666,
        0,
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as EthereumAddress,
        'msgChainId'
    ),
    prevMsgRef: new MessageRef(665, 0),
    content: utf8ToBinary(JSON.stringify({
        hello: 'world'
    })),
    contentType: ContentType.JSON,
    messageType: StreamMessageType.MESSAGE,
    encryptionType: EncryptionType.NONE,
    signatureType: SignatureType.SECP256K1,
    signature: hexToBinary('0x1234')
})
await networkNode.broadcast(streamMessage)

```

### Subscribing to messages

```js
const streamPartId = StreamPartIDUtils.parse('test#0')
networkNode.addMessageListener((msg) => {
    console.log(msg)
})
await networkNode.join(streamPartId)
```
