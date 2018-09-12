const { createConnection } = require('./src/connection/Connection')
const Node = require('./src/logic/Node')

const port = process.argv[2] || 30301

createConnection('127.0.0.1', port, '', true).then((connection) => {
    return new Node(connection)
}).catch((err) => {
    throw err
})
