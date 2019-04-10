const uuidv4 = require('uuid/v4')
const TrackerServer = require('./protocol/TrackerServer')
const TrackerNode = require('./protocol/TrackerNode')
const NodeToNode = require('./protocol/NodeToNode')
const Tracker = require('./logic/Tracker')
const Node = require('./logic/Node')
const NetworkNode = require('./NetworkNode')
const NoOpStorage = require('./NoOpStorage')
const { startEndpoint } = require('./connection/WsEndpoint')
const { MessageID, MessageReference, StreamID } = require('./identifiers')

async function startTracker(host, port, id = uuidv4(), maxNeighborsPerNode = 4) {
    const identity = {
        'streamr-peer-id': id,
        'streamr-peer-type': 'tracker'
    }
    return startEndpoint(host, port, identity).then((endpoint) => {
        return new Tracker(id, new TrackerServer(endpoint), maxNeighborsPerNode)
    }).catch((err) => {
        throw err
    })
}

async function startNode(host, port, id = uuidv4(), storage = new NoOpStorage()) {
    const identity = {
        'streamr-peer-id': id,
        'streamr-peer-type': 'node'
    }
    return startEndpoint(host, port, identity).then((endpoint) => {
        return new Node(id, new TrackerNode(endpoint), new NodeToNode(endpoint), storage)
    }).catch((err) => {
        throw err
    })
}

async function startNetworkNode(host, port, id = uuidv4(), storage = new NoOpStorage()) {
    const identity = {
        'streamr-peer-id': id,
        'streamr-peer-type': 'node'
    }
    return startEndpoint(host, port, identity).then((endpoint) => {
        return new NetworkNode(id, new TrackerNode(endpoint), new NodeToNode(endpoint), storage)
    }).catch((err) => {
        throw err
    })
}

module.exports = {
    startTracker,
    startNode,
    startNetworkNode,
    MessageID,
    MessageReference,
    StreamID
}
