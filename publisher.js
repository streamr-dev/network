const { MessageID, StreamID, MessageReference } = require('./src/identifiers')
const { startClient } = require('./src/composition')

const port = process.argv[2] || 30301
const nodeAddress = process.argv[3] || ''
const streamId = process.argv[4] || ''

const id = `publisher-${port}`

startClient('127.0.0.1', port, id, nodeAddress)
    .then((client) => {
        client.protocols.nodeToNode.endpoint.connect(nodeAddress)

        let lastTime = 0

        setInterval(() => {
            const msg = 'Hello world, ' + new Date().toLocaleString()
            const time = Date.now()

            client.publish(
                new MessageID(new StreamID(streamId, 0), time, 0, id),
                new MessageReference(lastTime, 0),
                msg
            )
            lastTime = time
        }, 1000)
    })
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
