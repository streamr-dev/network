const { startNode } = require('./src/composition')
const { BOOTNODES } = require('./src/util')

const port = process.argv[2] || 30301
const ip = process.argv[3] || '127.0.0.1'
const tracker = process.argv[4] || ''

startNode(ip, port, 'node' + port)
    .then((node) => {
        if (tracker) {
            node.addBootstrapTracker(tracker)
        } else {
            BOOTNODES.forEach((trackerAddress) => node.addBootstrapTracker(trackerAddress))
        }
    })
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
