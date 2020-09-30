const { v4: uuidv4 } = require('uuid')
const Protocol = require('streamr-client-protocol')

const TrackerServer = require('./protocol/TrackerServer')
const TrackerNode = require('./protocol/TrackerNode')
const NodeToNode = require('./protocol/NodeToNode')
const { PeerInfo } = require('./connection/PeerInfo')
const Tracker = require('./logic/Tracker')
const NetworkNode = require('./NetworkNode')
const logger = require('./helpers/logger')('streamr:bin:composition')
const { trackerHttpEndpoints } = require('./helpers/trackerHelpers')
const { startEndpoint, startWebSocketServer, WsEndpoint } = require('./connection/WsEndpoint')

const startTracker = async ({
    host, port, id = uuidv4(), exposeHttpEndpoints = true,
    maxNeighborsPerNode = 4, advertisedWsUrl = null, name, location, pingInterval,
    privateKeyFileName, certFileName
}) => {
    const peerInfo = PeerInfo.newTracker(id, name, location)
    const endpoint = await startEndpoint(host, port, peerInfo, advertisedWsUrl, pingInterval, privateKeyFileName, certFileName)

    const opts = {
        peerInfo,
        protocols: {
            trackerServer: new TrackerServer(endpoint)
        },
        maxNeighborsPerNode
    }
    const tracker = new Tracker(opts)

    if (exposeHttpEndpoints) {
        logger.debug('adding http endpoints to the tracker')
        trackerHttpEndpoints(endpoint.wss, tracker)
    }

    return tracker
}

function startNetworkNode(host, port, id = uuidv4(), storages = [], advertisedWsUrl = null, name, location, pingInterval) {
    const peerInfo = PeerInfo.newNode(id, name, location)
    return startEndpoint(host, port, peerInfo, advertisedWsUrl, pingInterval).then((endpoint) => {
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

function startStorageNode(host, port, id = uuidv4(), storages = [], advertisedWsUrl = null, name, location, pingInterval) {
    const peerInfo = PeerInfo.newStorage(id, name, location)
    return startEndpoint(host, port, peerInfo, advertisedWsUrl, pingInterval).then((endpoint) => {
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
    Protocol,
}
