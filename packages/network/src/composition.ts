import { v4 as uuidv4 } from 'uuid'
import * as Protocol from 'streamr-client-protocol'
import { MetricsContext } from './helpers/MetricsContext'
import { Location } from './identifiers'
import { PeerInfo } from './connection/PeerInfo'
import { startServerWsEndpoint } from './connection/ServerWsEndpoint'
import { Tracker } from './logic/Tracker'
import { TrackerServer } from './protocol/TrackerServer'
import { trackerHttpEndpoints } from './helpers/trackerHttpEndpoints'
import { TrackerNode } from './protocol/TrackerNode'
import { RtcSignaller } from './logic/RtcSignaller'
import { WebRtcEndpoint } from './connection/WebRtcEndpoint'
import { NodeToNode } from './protocol/NodeToNode'
import { NetworkNode } from './NetworkNode'
import { Logger } from './helpers/Logger'
import { NameDirectory } from './NameDirectory'
import { NegotiatedProtocolVersions } from "./connection/NegotiatedProtocolVersions"
import { startClientWsEndpoint } from './connection/ClientWsEndpoint'

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
    trackers: string[],
    disconnectionWaitTime?: number,
    newWebrtcConnectionTimeout?: number,
    webrtcDatachannelBufferThresholdLow?: number,
    webrtcDatachannelBufferThresholdHigh?: number,
    stunUrls?: string[]
}

export function startTracker({
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
}: TrackerOptions): Promise<Tracker> {
    const peerInfo = PeerInfo.newTracker(id, name, undefined, undefined, location)
    return startServerWsEndpoint(
        host,
        port,
        peerInfo,
        metricsContext,
        pingInterval,
        privateKeyFileName,
        certFileName
    ).then((endpoint) => {
        const tracker = new Tracker({
            peerInfo,
            protocols: {
                trackerServer: new TrackerServer(endpoint)
            },
            metricsContext,
            maxNeighborsPerNode,
        })

        if (attachHttpEndpoints) {
            trackerHttpEndpoints(endpoint.getWss(), tracker, metricsContext)
        }

        return tracker
    })
}

export const startNetworkNode = ({
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
}: NetworkNodeOptions): Promise<NetworkNode> => {
    const peerInfo = PeerInfo.newNode(id, name, undefined, undefined, location)
    return startClientWsEndpoint(peerInfo, metricsContext, pingInterval).then((endpoint) => {
        const trackerNode = new TrackerNode(endpoint)

        const webRtcSignaller = new RtcSignaller(peerInfo, trackerNode)
        const negotiatedProtocolVersions = new NegotiatedProtocolVersions(peerInfo)
        const nodeToNode = new NodeToNode(new WebRtcEndpoint(
            peerInfo,
            stunUrls,
            webRtcSignaller, 
            metricsContext,
            negotiatedProtocolVersions,
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
    })
}
