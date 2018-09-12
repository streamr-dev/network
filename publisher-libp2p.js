const ms = require('ms')
const { createConnection } = require('./src/connection/Connection')
const Publisher = require('./src/logic/Publisher')

const port = process.argv[2] || 30301
const nodeAddress = process.argv[3] || ''
const streamId = process.argv[4] || ''

createConnection('127.0.0.1', port, '', true).then((connection) => {
    connection.connect(nodeAddress)

    const publisher = new Publisher(connection)

    setInterval(() => {
        const msg = `Hello world, ${new Date().toLocaleString()}`
        publisher.publishLibP2P(streamId, Buffer.from(msg), () => {})
    }, ms('1s'))
}).catch((err) => {
    throw err
})
