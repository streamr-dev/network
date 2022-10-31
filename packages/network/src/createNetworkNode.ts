import { v4 as uuidv4 } from 'uuid'
import { MetricsContext } from '@streamr/utils'

import { AbstractNodeOptions } from './identifiers'
import { NodeToTracker } from './protocol/NodeToTracker'
import { NodeToNode } from './protocol/NodeToNode'
import { RtcSignaller } from './logic/RtcSignaller'
import { NetworkNode } from './logic/NetworkNode'
import { NegotiatedProtocolVersions } from './connection/NegotiatedProtocolVersions'
import { PeerInfo } from './connection/PeerInfo'
import NodeClientWsEndpoint from './connection/ws/NodeClientWsEndpoint'
import { WebRtcEndpoint } from './connection/webrtc/WebRtcEndpoint'
import { webRtcConnectionFactory } from './connection/webrtc/NodeWebRtcConnection'
import { SmartContractRecord } from 'streamr-client-protocol'

const DEFAULT_STUN_URLS = [
    'stun:stun.streamr.network:5349',
    'turn:BrubeckTurn1:MIlbgtMw4nhpmbgqRrht1Q==@turn.streamr.network:5349'
]

export interface NetworkNodeOptions extends AbstractNodeOptions {
    trackers: SmartContractRecord[]
    disconnectionWaitTime?: number
    peerPingInterval?: number
    newWebrtcConnectionTimeout?: number
    webrtcDatachannelBufferThresholdLow?: number
    webrtcDatachannelBufferThresholdHigh?: number
    stunUrls?: string[]
    rttUpdateTimeout?: number
    trackerConnectionMaintenanceInterval?: number
    webrtcDisallowPrivateAddresses?: boolean
    acceptProxyConnections?: boolean
}

export const createNetworkNode = ({
    id = uuidv4(),
    location,
    trackers,
    metricsContext = new MetricsContext(),
    peerPingInterval,
    trackerPingInterval,
    disconnectionWaitTime,
    newWebrtcConnectionTimeout,
    rttUpdateTimeout,
    webrtcDatachannelBufferThresholdLow,
    webrtcDatachannelBufferThresholdHigh,
    stunUrls = DEFAULT_STUN_URLS,
    trackerConnectionMaintenanceInterval,
    webrtcDisallowPrivateAddresses = true,
    acceptProxyConnections
}: NetworkNodeOptions): NetworkNode => {
    const peerInfo = PeerInfo.newNode(id, undefined, undefined, location)
    const endpoint = new NodeClientWsEndpoint(peerInfo, trackerPingInterval)
    const nodeToTracker = new NodeToTracker(endpoint)

    const webRtcSignaller = new RtcSignaller(peerInfo, nodeToTracker)
    const negotiatedProtocolVersions = new NegotiatedProtocolVersions(peerInfo)
    const nodeToNode = new NodeToNode(new WebRtcEndpoint(
        peerInfo,
        stunUrls,
        webRtcSignaller,
        metricsContext,
        negotiatedProtocolVersions,
        webRtcConnectionFactory,
        newWebrtcConnectionTimeout,
        peerPingInterval,
        webrtcDatachannelBufferThresholdLow,
        webrtcDatachannelBufferThresholdHigh,
        webrtcDisallowPrivateAddresses
    ))

    return new NetworkNode({
        peerInfo,
        trackers,
        protocols: {
            nodeToTracker,
            nodeToNode
        },
        metricsContext,
        disconnectionWaitTime,
        rttUpdateTimeout,
        trackerConnectionMaintenanceInterval,
        acceptProxyConnections
    })
}
