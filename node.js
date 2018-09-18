const { startNode } = require('./src/composition')

const port = process.argv[2] || 30301

startNode('127.0.0.1', port)
    .then(() => {})
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
