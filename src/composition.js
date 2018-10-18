const TrackerServer = require('./protocol/TrackerServer')
const TrackerNode = require('./protocol/TrackerNode')
const NodeToNode = require('./protocol/NodeToNode')
const Tracker = require('./logic/Tracker')
const Node = require('./logic/Node')
const Client = require('./logic/Client')
const NetworkNode = require('./NetworkNode')
const { startEndpoint } = require('./connection/WsEndpoint')

async function startTracker(host, port, id) {
    return startEndpoint(host, port).then((endpoint) => {
        return new Tracker(id, new TrackerServer(endpoint))
    }).catch((err) => {
        throw err
    })
}

async function startNode(host, port, id) {
    return startEndpoint(host, port).then((endpoint) => {
        return new Node(id, new TrackerNode(endpoint), new NodeToNode(endpoint))
    }).catch((err) => {
        throw err
    })
}

async function startClient(host, port, id, nodeAddress) {
    return startEndpoint(host, port).then((endpoint) => {
        return new Client(id, new NodeToNode(endpoint), nodeAddress)
    }).catch((err) => {
        throw err
    })
}

async function startNetworkNode(host, port, id) {
    return startEndpoint(host, port).then((endpoint) => {
        return new NetworkNode(id, new TrackerNode(endpoint), new NodeToNode(endpoint))
    }).catch((err) => {
        throw err
    })
}

module.exports = {
    startTracker,
    startNode,
    startClient,
    startNetworkNode
}
