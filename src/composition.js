const uuidv4 = require('uuid/v4')
const TrackerServer = require('./protocol/TrackerServer')
const TrackerNode = require('./protocol/TrackerNode')
const NodeToNode = require('./protocol/NodeToNode')
const Tracker = require('./logic/Tracker')
const Node = require('./logic/Node')
const Client = require('./logic/Client')
const NetworkNode = require('./NetworkNode')
const PeerBook = require('./PeerBook')
const { startEndpoint } = require('./connection/WsEndpoint')

async function startTracker(host, port, id = uuidv4()) {
    const identity = {
        'streamr-peer-id': id,
        'streamr-peer-type': 'tracker'
    }
    return startEndpoint(host, port, identity).then((endpoint) => {
        return new Tracker(id, new PeerBook(endpoint), new TrackerServer(endpoint))
    }).catch((err) => {
        throw err
    })
}

async function startNode(host, port, id = uuidv4()) {
    const identity = {
        'streamr-peer-id': id,
        'streamr-peer-type': 'node'
    }
    return startEndpoint(host, port, identity).then((endpoint) => {
        return new Node(id, new PeerBook(endpoint), new TrackerNode(endpoint), new NodeToNode(endpoint))
    }).catch((err) => {
        throw err
    })
}

async function startClient(host, port, id = uuidv4(), nodeAddress) {
    const identity = {
        'streamr-peer-id': id,
        'streamr-peer-type': 'client'
    }
    return startEndpoint(host, port, identity).then((endpoint) => {
        return new Client(id, new PeerBook(endpoint), new NodeToNode(endpoint), nodeAddress)
    }).catch((err) => {
        throw err
    })
}

async function startNetworkNode(host, port, id = uuidv4()) {
    const identity = {
        'streamr-peer-id': id,
        'streamr-peer-type': 'node'
    }
    return startEndpoint(host, port, identity).then((endpoint) => {
        return new NetworkNode(id, new PeerBook(endpoint), new TrackerNode(endpoint), new NodeToNode(endpoint))
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
