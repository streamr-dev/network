const { v4: uuidv4 } = require('uuid')
const Protocol = require('streamr-client-protocol')

const TrackerServer = require('./protocol/TrackerServer')
const TrackerNode = require('./protocol/TrackerNode')
const NodeToNode = require('./protocol/NodeToNode')
const { PeerInfo } = require('./connection/PeerInfo')
const Tracker = require('./logic/Tracker')
const NetworkNode = require('./NetworkNode')
const logger = require('./helpers/logger')('streamr:bin:composition')
const MetricsContext = require('./helpers/MetricsContext')
const { trackerHttpEndpoints } = require('./helpers/trackerHttpEndpoints')
const { startEndpoint } = require('./connection/WsEndpoint')

function startTracker({
    host,
    port,
    id = uuidv4(),
    attachHttpEndpoints = true,
    maxNeighborsPerNode = 4,
    advertisedWsUrl = null,
    metricsContext = new MetricsContext(id),
    name,
    location,
    pingInterval,
    privateKeyFileName,
    certFileName,
}) {
    const peerInfo = PeerInfo.newTracker(id, name, location)
    return startEndpoint(host, port, peerInfo, advertisedWsUrl, metricsContext, pingInterval, privateKeyFileName, certFileName)
        .then((endpoint) => {
            const tracker = new Tracker({
                peerInfo,
                protocols: {
                    trackerServer: new TrackerServer(endpoint)
                },
                metricsContext,
                maxNeighborsPerNode,
            })

            if (attachHttpEndpoints) {
                logger.debug('attaching HTTP endpoints to the tracker on port %s', port)
                trackerHttpEndpoints(endpoint.wss, tracker, metricsContext)
            }

            return tracker
        })
}

function startNetworkNode({
    host,
    port,
    id = uuidv4(),
    name,
    trackers,
    storages = [],
    advertisedWsUrl = null,
    metricsContext = new MetricsContext(id),
    location,
    pingInterval,
    disconnectionWaitTime
}) {
    const peerInfo = PeerInfo.newNode(id, name, location)
    return startEndpoint(host, port, peerInfo, advertisedWsUrl, metricsContext, pingInterval).then((endpoint) => {
        return new NetworkNode({
            peerInfo,
            trackers,
            protocols: {
                trackerNode: new TrackerNode(endpoint),
                nodeToNode: new NodeToNode(endpoint)
            },
            metricsContext,
            storages,
            disconnectionWaitTime
        })
    })
}

function startStorageNode({
    host,
    port,
    id = uuidv4(),
    trackers,
    storages = [],
    advertisedWsUrl = null,
    metricsContext = new MetricsContext(id),
    name,
    location,
    pingInterval,
    disconnectionWaitTime
}) {
    const peerInfo = PeerInfo.newStorage(id, name, location)
    return startEndpoint(host, port, peerInfo, advertisedWsUrl, metricsContext, pingInterval).then((endpoint) => {
        return new NetworkNode({
            peerInfo,
            trackers,
            protocols: {
                trackerNode: new TrackerNode(endpoint),
                nodeToNode: new NodeToNode(endpoint)
            },
            metricsContext,
            storages,
            disconnectionWaitTime
        })
    })
}

module.exports = {
    startTracker,
    startNetworkNode,
    startStorageNode,
    MetricsContext,
    Protocol,
}
