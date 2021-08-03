import { v4 as uuidv4 } from 'uuid'
import * as Protocol from 'streamr-client-protocol'
import { MetricsContext } from './helpers/MetricsContext'
import { Location, TrackerInfo } from './identifiers'
import { PeerInfo } from './connection/PeerInfo'
import { ServerWsEndpoint, startHttpServer } from './connection/ws/ServerWsEndpoint'
import { Tracker } from './logic/Tracker'
import { TrackerServer } from './protocol/TrackerServer'
import { trackerHttpEndpoints } from './helpers/trackerHttpEndpoints'
import { TrackerNode } from './protocol/TrackerNode'
import { RtcSignaller } from './logic/RtcSignaller'
import { NodeToNode } from './protocol/NodeToNode'
import { NetworkNode } from './NetworkNode'
import { Logger } from './helpers/Logger'
import { NameDirectory } from './NameDirectory'
import { NegotiatedProtocolVersions } from "./connection/NegotiatedProtocolVersions"
import NodeClientWsEndpoint from './connection/ws/NodeClientWsEndpoint'
import { WebRtcEndpoint } from './connection/WebRtcEndpoint'
import NodeWebRtcConnectionFactory from "./connection/NodeWebRtcConnection"

require('setimmediate')

export {
    Location,
    MetricsContext,
    NetworkNode,
    Protocol,
    Tracker,
    Logger,
    NameDirectory
}

export interface AbstractNodeOptions {
    id?: string
    name?: string
    location?: Location | null
    metricsContext?: MetricsContext
    pingInterval?: number
}

export interface TrackerOptions extends AbstractNodeOptions {
    host: string
    port: number
    attachHttpEndpoints?: boolean
    maxNeighborsPerNode?: number
    privateKeyFileName?: string
    certFileName?: string
}

export interface NetworkNodeOptions extends AbstractNodeOptions {
    trackers: TrackerInfo[],
    disconnectionWaitTime?: number,
    newWebrtcConnectionTimeout?: number,
    webrtcDatachannelBufferThresholdLow?: number,
    webrtcDatachannelBufferThresholdHigh?: number,
    stunUrls?: string[]
}

export const startTracker = async ({
    host,
    port,
    id = uuidv4(),
    name,
    location,
    attachHttpEndpoints = true,
    maxNeighborsPerNode = 4,
    metricsContext = new MetricsContext(id),
    pingInterval,
    privateKeyFileName,
    certFileName,
}: TrackerOptions): Promise<Tracker> => {
    const peerInfo = PeerInfo.newTracker(id, name, undefined, undefined, location)
    const httpServer = await startHttpServer(host, port, privateKeyFileName, certFileName)
    const endpoint = new ServerWsEndpoint(host, port, privateKeyFileName !== undefined, httpServer, peerInfo, metricsContext, pingInterval)

    const tracker = new Tracker({
        peerInfo,
        protocols: {
            trackerServer: new TrackerServer(endpoint)
        },
        metricsContext,
        maxNeighborsPerNode,
    })

    if (attachHttpEndpoints) {
        trackerHttpEndpoints(httpServer, tracker, metricsContext)
    }

    return tracker
}

export const createNetworkNode = ({
    id = uuidv4(),
    name,
    location,
    trackers,
    metricsContext = new MetricsContext(id),
    pingInterval,
    disconnectionWaitTime,
    newWebrtcConnectionTimeout,
    webrtcDatachannelBufferThresholdLow,
    webrtcDatachannelBufferThresholdHigh,
    stunUrls = ['stun:stun.l.google.com:19302']
}: NetworkNodeOptions): NetworkNode => {
    const peerInfo = PeerInfo.newNode(id, name, undefined, undefined, location)
    const endpoint = new NodeClientWsEndpoint(peerInfo, metricsContext, pingInterval)
    const trackerNode = new TrackerNode(endpoint)

    const webRtcSignaller = new RtcSignaller(peerInfo, trackerNode)
    const negotiatedProtocolVersions = new NegotiatedProtocolVersions(peerInfo)
    const nodeToNode = new NodeToNode(new WebRtcEndpoint(
        peerInfo,
        stunUrls,
        webRtcSignaller,
        metricsContext,
        negotiatedProtocolVersions,
        NodeWebRtcConnectionFactory,
        newWebrtcConnectionTimeout,
        pingInterval,
        webrtcDatachannelBufferThresholdLow,
        webrtcDatachannelBufferThresholdHigh,
    ))

    return new NetworkNode({
        peerInfo,
        trackers,
        protocols: {
            trackerNode,
            nodeToNode
        },
        metricsContext,
        disconnectionWaitTime
    })
}
