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
import { TrackerRegistryRecord } from '@streamr/protocol'
import { IceServer } from './connection/webrtc/WebRtcConnection'

export interface NetworkNodeOptions extends AbstractNodeOptions {
    trackers: TrackerRegistryRecord[]
    disconnectionWaitTime: number
    peerPingInterval: number
    newWebrtcConnectionTimeout: number
    webrtcDatachannelBufferThresholdLow: number
    webrtcDatachannelBufferThresholdHigh: number
    iceServers: ReadonlyArray<IceServer>
    rttUpdateTimeout: number
    trackerConnectionMaintenanceInterval: number
    webrtcDisallowPrivateAddresses?: boolean
    acceptProxyConnections?: boolean
}

export const CONFIG_DEFAULTS: Omit<NetworkNodeOptions, 'trackers'> = {
    disconnectionWaitTime: 30 * 1000,
    peerPingInterval: 30 * 1000,
    newWebrtcConnectionTimeout: 15000,
    webrtcDatachannelBufferThresholdLow: 2 ** 15,
    webrtcDatachannelBufferThresholdHigh: 2 ** 17,
    iceServers: [],
    rttUpdateTimeout: 15000,
    trackerConnectionMaintenanceInterval: 5000
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
    iceServers,
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
        iceServers,
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
