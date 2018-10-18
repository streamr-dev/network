const { startNode } = require('./src/composition')
const { BOOTNODES } = require('./src/util')

const port = process.argv[2] || 30301

startNode('127.0.0.1', port, 'node' + port)
    .then((node) => {
        node.setBootstrapTrackers(BOOTNODES)
    })
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
