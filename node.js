const { startNode } = require('./src/composition')

const port = process.argv[2] || 30301
const ip = process.argv[3] || '127.0.0.1'
const tracker = process.argv[4] || 'ws://127.0.0.1:30300'

startNode(ip, port, 'node' + port)
    .then((node) => {
        node.addBootstrapTracker(tracker)
    })
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })

