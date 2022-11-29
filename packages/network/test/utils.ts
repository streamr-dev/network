import https from 'https'
import http from 'http'
import { v4 as uuidv4 } from 'uuid'
import { StreamPartID, toStreamID, toStreamPartID } from '@streamr/protocol'
import { Tracker } from '@streamr/network-tracker'
import { PeerInfo } from '../src/connection/PeerInfo'
import { startHttpServer, ServerWsEndpoint, HttpServerConfig } from '../src/connection/ws/ServerWsEndpoint'
import { Node } from '../src/logic/Node'
import { CONFIG_DEFAULTS, createNetworkNode, NetworkNodeOptions } from '../src/createNetworkNode'
import { WebRtcConnectionFactory, WebRtcEndpoint } from '../src/connection/webrtc/WebRtcEndpoint'
import { IceServer } from '../src/connection/webrtc/WebRtcConnection'
import { RtcSignaller } from '../src/logic/RtcSignaller'
import { MetricsContext } from '@streamr/utils'
import { NegotiatedProtocolVersions } from '../src/connection/NegotiatedProtocolVersions'
import NodeClientWsEndpoint from '../src/connection/ws/NodeClientWsEndpoint'

export const createTestNetworkNode = (opts: Partial<NetworkNodeOptions> & Pick<NetworkNodeOptions, 'trackers'>) => {
    return createNetworkNode({
        ...CONFIG_DEFAULTS,
        id: uuidv4(),
        metricsContext: new MetricsContext(),
        ...opts
    })
}

export const createTestWebRtcEndpoint = (
    peerInfo: PeerInfo,
    iceServers: ReadonlyArray<IceServer>,
    rtcSignaller: RtcSignaller,
    metricsContext: MetricsContext,
    negotiatedProtocolVersions: NegotiatedProtocolVersions,
    connectionFactory: WebRtcConnectionFactory,
    newConnectionTimeout?: number,
    pingInterval?: number,
    webrtcDatachannelBufferThresholdLow?: number,
    webrtcDatachannelBufferThresholdHigh?: number,
    webrtcDisallowPrivateAddresses?: boolean
) => {
    return new WebRtcEndpoint(
        peerInfo,
        iceServers,
        rtcSignaller,
        metricsContext,
        negotiatedProtocolVersions,
        connectionFactory,
        newConnectionTimeout ?? CONFIG_DEFAULTS.newWebrtcConnectionTimeout,
        pingInterval ?? CONFIG_DEFAULTS.peerPingInterval,
        webrtcDatachannelBufferThresholdLow ?? CONFIG_DEFAULTS.webrtcDatachannelBufferThresholdLow,
        webrtcDatachannelBufferThresholdHigh ?? CONFIG_DEFAULTS.webrtcDatachannelBufferThresholdHigh,
        webrtcDisallowPrivateAddresses
    )
}

export const createTestNodeClientWsEndpoint = (peerInfo: PeerInfo) => {
    return new NodeClientWsEndpoint(peerInfo, CONFIG_DEFAULTS.trackerPingInterval)
}

export const createTestServerWsEndpoint = (listen: HttpServerConfig,
    sslEnabled: boolean,
    httpServer: http.Server | https.Server,
    peerInfo: PeerInfo,) => {
    return new ServerWsEndpoint(listen, sslEnabled, httpServer, peerInfo, CONFIG_DEFAULTS.trackerPingInterval)
}

export const startServerWsEndpoint = async (
    host: string,
    port: number,
    peerInfo: PeerInfo,
): Promise<ServerWsEndpoint> => {
    const listen = {
        hostname: host,
        port: port
    }
    const httpServer = await startHttpServer(listen, undefined, undefined)
    return createTestServerWsEndpoint(listen, false, httpServer, peerInfo)
}

export const createStreamPartId = (streamIdAsStr: string, streamPartition: number): StreamPartID => {
    return toStreamPartID(toStreamID(streamIdAsStr), streamPartition)
}

export const getStreamParts = (nodeOrTracker: Node | Tracker): StreamPartID[] => {
    return Array.from(nodeOrTracker.getStreamParts())
}
