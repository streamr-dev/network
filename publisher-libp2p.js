const Connection = require('./src/connection/Connection')
const Publisher = require('./src/logic/Publisher')
const ms = require('ms')

const port = process.argv[2] || 30301
const nodeAddress = process.argv[3] || ''
const streamId = process.argv[4] || ''

const connection = new Connection('127.0.0.1', port, '', true)
connection.once('node:ready', () => {
    connection.connect(nodeAddress)

    const publisher = new Publisher(connection)

    setInterval(() => {
        const msg = 'Hello world, ' + new Date().toLocaleString()

        if (publisher.connection.isReady()) {
            publisher.publishLibP2P(streamId, Buffer.from(msg), () => {})
        }
    }, ms('1s'))
})
