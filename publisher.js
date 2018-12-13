const { startClient } = require('./src/composition')

const port = process.argv[2] || 30301
const nodeAddress = process.argv[3] || ''
const streamId = process.argv[4] || ''

startClient('127.0.0.1', port, 'publisher1', nodeAddress)
    .then((client) => {
        client.protocols.nodeToNode.endpoint.connect(nodeAddress)

        let messageNo = 1

        setInterval(() => {
            const msg = 'Hello world, ' + new Date().toLocaleString()
            client.publish(streamId, msg, messageNo, messageNo - 1)
            messageNo += 1
        }, 1000)
    })
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
