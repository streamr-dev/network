const { createEndpoint } = require('./src/connection/Libp2pEndpoint')
const Publisher = require('./src/logic/Publisher')
const NodeToNode = require('./src/protocol/NodeToNode')

const port = process.argv[2] || 30301
const nodeAddress = process.argv[3] || ''
const streamId = process.argv[4] || ''

createEndpoint('127.0.0.1', port, '', true).then((endpoint) => {
    endpoint.connect(nodeAddress)

    const publisher = new Publisher(new NodeToNode(endpoint), nodeAddress)

    setInterval(() => {
        const msg = 'Hello world, ' + new Date().toLocaleString()
        publisher.publish(streamId, msg, () => {})
    }, 1000)
}).catch((err) => {
    throw err
})
