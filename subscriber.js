const { startClient } = require('./src/composition')
const NodeToNode = require('./src/protocol/NodeToNode')

const port = process.argv[2] || 30301
const nodeAddress = process.argv[3] || ''
const streamIdParam = process.argv[4] || ''

startClient('127.0.0.1', port, null, nodeAddress).then((client) => {
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
