const { v4: uuidv4 } = require('uuid')

const TrackerServer = require('./protocol/TrackerServer')
const TrackerNode = require('./protocol/TrackerNode')
const NodeToNode = require('./protocol/NodeToNode')
const { PeerInfo } = require('./connection/PeerInfo')
const Tracker = require('./logic/Tracker')
const NetworkNode = require('./NetworkNode')
const { startEndpoint } = require('./connection/WsEndpoint')

function startTracker(host, port, id = uuidv4(), maxNeighborsPerNode = 4, advertisedWsUrl = null) {
    const peerInfo = PeerInfo.newTracker(id)
    return startEndpoint(host, port, peerInfo, advertisedWsUrl).then((endpoint) => {
        const opts = {
            peerInfo,
            protocols: {
                trackerServer: new TrackerServer(endpoint)
            },
            maxNeighborsPerNode
        }
        return new Tracker(opts)
    })
}

function startNetworkNode(host, port, id = uuidv4(), storages = [], advertisedWsUrl = null) {
    const peerInfo = PeerInfo.newNode(id)
    return startEndpoint(host, port, peerInfo, advertisedWsUrl).then((endpoint) => {
        const opts = {
            peerInfo,
            protocols: {
                trackerNode: new TrackerNode(endpoint),
                nodeToNode: new NodeToNode(endpoint)
            },
            storages
        }
        return new NetworkNode(opts)
    })
}

function startStorageNode(host, port, id = uuidv4(), storages = [], advertisedWsUrl = null) {
    const peerInfo = PeerInfo.newStorage(id)
    return startEndpoint(host, port, peerInfo, advertisedWsUrl).then((endpoint) => {
        const opts = {
            peerInfo,
            protocols: {
                trackerNode: new TrackerNode(endpoint),
                nodeToNode: new NodeToNode(endpoint)
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
