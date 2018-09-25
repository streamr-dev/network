const { createEndpoint } = require('./connection/Libp2pEndpoint')
const TrackerServer = require('./protocol/TrackerServer')
const TrackerNode = require('./protocol/TrackerNode')
const NodeToNode = require('./protocol/NodeToNode')
const Tracker = require('./logic/Tracker')
const Node = require('./logic/Node')
const Client = require('./logic/Client')
const NetworkNode = require('./NetworkNode')

async function startTracker(host, port, privateKey) {
    return createEndpoint(host, port, privateKey, false).then((endpoint) => {
        return new Tracker(new TrackerServer(endpoint))
    }).catch((err) => {
        throw err
    })
}

async function startNode(host, port, privateKey, bootstrapTrackers) {
    return createEndpoint(host, port, privateKey, true, bootstrapTrackers).then((endpoint) => {
        return new Node(new TrackerNode(endpoint), new NodeToNode(endpoint))
    }).catch((err) => {
        throw err
    })
}

async function startClient(host, port, nodeAddress) {
    return createEndpoint(host, port, '', false).then((endpoint) => {
        return new Client(new NodeToNode(endpoint), nodeAddress)
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
    startClient,
    startNetworkNode
}
