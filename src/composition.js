const uuidv4 = require('uuid/v4')

const TrackerServer = require('./protocol/TrackerServer')
const TrackerNode = require('./protocol/TrackerNode')
const NodeToNode = require('./protocol/NodeToNode')
const BasicProtocol = require('./protocol/BasicProtocol')
const { peerTypes } = require('./protocol/PeerBook')
const Tracker = require('./logic/Tracker')
const NetworkNode = require('./NetworkNode')
const { startEndpoint } = require('./connection/WsEndpoint')

function startTracker(host, port, id = uuidv4(), maxNeighborsPerNode = 4, advertisedWsUrl = null) {
    const identity = {
        'streamr-peer-id': id,
        'streamr-peer-type': peerTypes.TRACKER
    }
    return startEndpoint(host, port, identity, advertisedWsUrl).then((endpoint) => {
        const basicProtocol = new BasicProtocol(endpoint)
        const opts = {
            id,
            protocols: {
                trackerServer: new TrackerServer(basicProtocol)
            },
            maxNeighborsPerNode
        }
        return new Tracker(opts)
    })
}

function startNetworkNode(host, port, id = uuidv4(), storages = [], advertisedWsUrl = null) {
    const identity = {
        'streamr-peer-id': id,
        'streamr-peer-type': peerTypes.NODE
    }
    return startEndpoint(host, port, identity, advertisedWsUrl).then((endpoint) => {
        const basicProtocol = new BasicProtocol(endpoint)
        const opts = {
            id,
            protocols: {
                trackerNode: new TrackerNode(basicProtocol),
                nodeToNode: new NodeToNode(basicProtocol)
            },
            storages
        }
        return new NetworkNode(opts)
    })
}

function startStorageNode(host, port, id = uuidv4(), storages = [], advertisedWsUrl = null) {
    const identity = {
        'streamr-peer-id': id,
        'streamr-peer-type': peerTypes.STORAGE
    }
    return startEndpoint(host, port, identity, advertisedWsUrl).then((endpoint) => {
        const basicProtocol = new BasicProtocol(endpoint)
        const opts = {
            id,
            protocols: {
                trackerNode: new TrackerNode(basicProtocol),
                nodeToNode: new NodeToNode(basicProtocol)
            },
            storages
        }
        return new NetworkNode(opts)
    })
}

module.exports = {
    startTracker,
    startNetworkNode,
    startStorageNode,
}
