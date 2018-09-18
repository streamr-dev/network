const { createConnection } = require('./connection/Connection')
const TrackerServer = require('./protocol/TrackerServer')
const TrackerNode = require('./protocol/TrackerNode')
const NodeToNode = require('./protocol/NodeToNode')
const Tracker = require('./logic/Tracker')
const Node = require('./logic/Node')
const NetworkNode = require('./NetworkNode')

async function startTracker(host, port, privateKey) {
    return createConnection(host, port, privateKey, false).then((connection) => {
        return new Tracker(new TrackerServer(connection))
    }).catch((err) => {
        throw err
    })
}

async function startNode(host, port, privateKey, bootstrapTrackers) {
    return createConnection(host, port, privateKey, true, bootstrapTrackers).then((connection) => {
        return new Node(new TrackerNode(connection), new NodeToNode(connection))
    }).catch((err) => {
        throw err
    })
}

async function startNetworkNode(host, port, privateKey, bootstrapTrackers) {
    const node = await startNode(host, port, privateKey, bootstrapTrackers)
    return new NetworkNode(node)
}

module.exports = {
    startTracker,
    startNode,
    startNetworkNode
}
