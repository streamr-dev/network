const { startNetworkNode } = require('./src/composition')
const NodeToNode = require('./src/protocol/NodeToNode')

const port = process.argv[2] || 30304
const host = process.argv[3] || '127.0.0.1'
const trackers = process.argv[4] ? process.argv[4].split(',') : ['ws://127.0.0.1:30300']
const streamId = process.argv[5] || 'default-stream-id'

const id = `subscriber-${port}`

startNetworkNode(host, port, id).then(async (subscriber) => {
    await Promise.all(trackers.map((trackerAddress) => subscriber.addBootstrapTracker(trackerAddress)))

    const subscribeInterval = setInterval(() => {
        subscriber.subscribe(streamId, 0)
    }, 1000)

    subscriber.protocols.nodeToNode.on(NodeToNode.events.DATA_RECEIVED, (dataMessage) => {
        console.log('received ' + dataMessage.getMessageId() + ', data ' + dataMessage.getData())

        if (subscribeInterval !== null) {
            clearInterval(subscribeInterval)
        }
    })
}).catch((err) => {
    throw err
})

if (process.env.checkUncaughtException === 'true') {
    process.on('uncaughtException', (err) => console.error((err && err.stack) ? err.stack : err))
}
