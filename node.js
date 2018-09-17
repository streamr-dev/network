const { createConnection } = require('./src/connection/Connection')
const NodeToNode = require('./src/protocol/NodeToNode')
const TrackerNode = require('./src/protocol/TrackerNode')
const Node = require('./src/logic/Node')

const port = process.argv[2] || 30301

createConnection('127.0.0.1', port, '', true).then((connection) => {
    return new Node(new TrackerNode(connection), new NodeToNode(connection))
}).catch((err) => {
    throw err
})
