const { createConnection } = require('./src/connection/Connection')
const Publisher = require('./src/logic/Publisher')

const port = process.argv[2] || 30301
const nodeAddress = process.argv[3] || ''
const streamId = process.argv[4] || ''

createConnection('127.0.0.1', port, '', true).then((connection) => {
    connection.connect(nodeAddress)

    const publisher = new Publisher(connection, nodeAddress)

    setInterval(() => {
        const msg = 'Hello world, ' + new Date().toLocaleString()
        publisher.publish(streamId, msg, () => {})
    }, 1000)
}).catch((err) => {
    throw err
})
