const { createEndpoint } = require('./src/connection/Libp2pEndpoint')
const Client = require('./src/logic/Client')
const NodeToNode = require('./src/protocol/NodeToNode')

const port = process.argv[2] || 30301
const nodeAddress = process.argv[3] || ''
const streamIdParam = process.argv[4] || ''

createEndpoint('127.0.0.1', port, '', true).then((endpoint) => {
    endpoint.connect(nodeAddress)

    const client = new Client(new NodeToNode(endpoint), nodeAddress)

    const subscribeInterval = setInterval(() => {
        client.subscribe(streamIdParam)
    }, 1000)

    client.protocols.nodeToNode.on(NodeToNode.events.DATA_RECEIVED, ({ streamId, data }) => {
        console.log('received for streamdId ' + streamId + ', data ' + data)

        if (subscribeInterval !== null) {
            clearInterval(subscribeInterval)
        }
    })
}).catch((err) => {
    throw err
})
