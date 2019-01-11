const { startClient } = require('./src/composition')
const NodeToNode = require('./src/protocol/NodeToNode')
const { StreamID } = require('./src/identifiers')

const port = process.argv[2] || 30301
const nodeAddress = process.argv[3] || ''
const streamIdParam = process.argv[4] || ''

const id = `subscriber-${port}`

startClient('127.0.0.1', port, id, nodeAddress).then((client) => {
    const subscribeInterval = setInterval(() => {
        client.subscribe(new StreamID(streamIdParam, 0))
    }, 1000)

    client.protocols.nodeToNode.on(NodeToNode.events.DATA_RECEIVED, (dataMessage) => {
        console.log('received ' + dataMessage.getMessageId() + ', data ' + dataMessage.getData())

        if (subscribeInterval !== null) {
            clearInterval(subscribeInterval)
        }
    })
}).catch((err) => {
    throw err
})
