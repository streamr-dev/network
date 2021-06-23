import { v4 as uuidv4 } from 'uuid'
import * as Protocol from 'streamr-client-protocol'
import { MetricsContext } from './helpers/MetricsContext'
import { Location } from './identifiers'
import { PeerInfo } from './connection/PeerInfo'
import { startEndpoint } from './connection/WsEndpoint'
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
import { WebRtcEndpoint } from './connection/WebRtcEndpoint'
import { NodeWebRtcConnectionFactory } from './connection/webRtcConnectionFactories'

export {
    Location,
    MetricsContext,
    NetworkNode,
    Protocol,
    Tracker,
    Logger,
    NameDirectory
}

export interface TrackerOptions {
    host: string
    port: number
    id?: string
    name?: string
    location?: Location | null
    attachHttpEndpoints?: boolean
    maxNeighborsPerNode?: number
    advertisedWsUrl?: string | null
    metricsContext?: MetricsContext
    pingInterval?: number
    privateKeyFileName?: string
    certFileName?: string
}

export interface NetworkNodeOptions {
    host: string,
    port: number,
    trackers: string[],
    id?: string,
    name?: string,
    location?: Location | null
    advertisedWsUrl?: string | null
    metricsContext?: MetricsContext
    pingInterval?: number,
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
    advertisedWsUrl = null,
    metricsContext = new MetricsContext(id),
    pingInterval,
    privateKeyFileName,
    certFileName,
}: TrackerOptions): Promise<Tracker> {
    const peerInfo = PeerInfo.newTracker(id, name, undefined, undefined, location)
    return startEndpoint(
        host,
        port,
        peerInfo,
        advertisedWsUrl,
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

export function startNetworkNode(opts: NetworkNodeOptions): Promise<NetworkNode> {
    return startNode(opts, PeerInfo.newNode)
}

type PeerInfoFn = (
    id: string,
    name: string | undefined,
    controlLayerVersion?: number[],
    messageLayerVersion?: number[],
    location?: Location | null | undefined
) => PeerInfo

function startNode({
    host,
    port,
    id = uuidv4(),
    name,
    location,
    trackers,
    advertisedWsUrl  = null,
    metricsContext = new MetricsContext(id),
    pingInterval,
    disconnectionWaitTime,
    newWebrtcConnectionTimeout,
    webrtcDatachannelBufferThresholdLow,
    webrtcDatachannelBufferThresholdHigh,
    stunUrls = ['stun:stun.l.google.com:19302']
}: NetworkNodeOptions, peerInfoFn: PeerInfoFn): Promise<NetworkNode> {
    const peerInfo = peerInfoFn(id, name, undefined, undefined, location)
    return startEndpoint(host, port, peerInfo, advertisedWsUrl, metricsContext, pingInterval).then((endpoint) => {
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
    })
}
