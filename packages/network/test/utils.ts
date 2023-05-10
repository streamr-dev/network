import https from 'https'
import http from 'http'
import { v4 as uuidv4 } from 'uuid'
import { StreamPartID, toStreamID, toStreamPartID } from '@streamr/protocol'
import { startTracker, Tracker } from '@streamr/network-tracker'
import { PeerInfo } from '../src/connection/PeerInfo'
import { startHttpServer, ServerWsEndpoint, HttpServerConfig } from '../src/connection/ws/ServerWsEndpoint'
import { Node } from '../src/logic/Node'
import { TEST_CONFIG, createNetworkNode, NetworkNodeOptions } from '../src/createNetworkNode'
import { WebRtcConnectionFactory, WebRtcEndpoint } from '../src/connection/webrtc/WebRtcEndpoint'
import { IceServer } from '../src/connection/webrtc/WebRtcConnection'
import { RtcSignaller } from '../src/logic/RtcSignaller'
import { MetricsContext } from '@streamr/utils'
import { NegotiatedProtocolVersions } from '../src/connection/NegotiatedProtocolVersions'
import NodeClientWsEndpoint from '../src/connection/ws/NodeClientWsEndpoint'
import { NetworkNode } from '../src/logic/NetworkNode'
import { merge } from '@streamr/utils'

export const createTestNetworkNode = (opts: Partial<NetworkNodeOptions> & Pick<NetworkNodeOptions, 'trackers'>): NetworkNode => {
    return createNetworkNode(
        merge<NetworkNodeOptions>(
            TEST_CONFIG,
            {
                id: uuidv4(),
                metricsContext: new MetricsContext()
            },
            opts
        )
    )
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
): WebRtcEndpoint => {
    return new WebRtcEndpoint(
        peerInfo,
        iceServers,
        rtcSignaller,
        metricsContext,
        negotiatedProtocolVersions,
        connectionFactory,
        newConnectionTimeout ?? TEST_CONFIG.newWebrtcConnectionTimeout,
        pingInterval ?? TEST_CONFIG.peerPingInterval,
        webrtcDatachannelBufferThresholdLow ?? TEST_CONFIG.webrtcDatachannelBufferThresholdLow,
        webrtcDatachannelBufferThresholdHigh ?? TEST_CONFIG.webrtcDatachannelBufferThresholdHigh,
        TEST_CONFIG.webrtcSendBufferMaxMessageCount,
        webrtcDisallowPrivateAddresses ?? false,
        TEST_CONFIG.webrtcPortRange,
        TEST_CONFIG.webrtcMaxMessageSize,
    )
}

export const createTestNodeClientWsEndpoint = (peerInfo: PeerInfo): NodeClientWsEndpoint => {
    return new NodeClientWsEndpoint(peerInfo, TEST_CONFIG.trackerPingInterval)
}

export const createTestServerWsEndpoint = (listen: HttpServerConfig,
    sslEnabled: boolean,
    httpServer: http.Server | https.Server,
    peerInfo: PeerInfo
): ServerWsEndpoint => {
    return new ServerWsEndpoint(listen, sslEnabled, httpServer, peerInfo, TEST_CONFIG.trackerPingInterval)
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

export const startTestTracker = (opts: { port: number, pingInterval?: number }): Promise<Tracker> => {
    return startTracker({
        listen: {
            hostname: '127.0.0.1',
            port: opts.port
        },
        id: 'tr-' + uuidv4(),
        trackerPingInterval: opts.pingInterval ?? TEST_CONFIG.trackerPingInterval,
        metricsContext: new MetricsContext()
    })
}

export const createStreamPartId = (streamIdAsStr: string, streamPartition: number): StreamPartID => {
    return toStreamPartID(toStreamID(streamIdAsStr), streamPartition)
}

export const getStreamParts = (nodeOrTracker: Node | Tracker): StreamPartID[] => {
    return Array.from(nodeOrTracker.getStreamParts())
}
