import { IWebRtcEndpoint } from './IWebRtcEndpoint'
import { PeerInfo } from './PeerInfo'
import { ConstructorOptions } from './WebRtcConnection'
import nodeDataChannel from 'node-datachannel'
import { MetricsContext } from '../helpers/MetricsContext'
import { RtcSignaller } from '../logic/RtcSignaller'
import { NegotiatedProtocolVersions } from "./NegotiatedProtocolVersions"
import { WebRtcEndpoint } from './WebRtcEndpoint'
import { NodeWebRtcConnection } from './NodeWebRtcConnection'
import { WebRtcConnection } from './WebRtcConnection'

export class NodeWebRtcEndpoint extends WebRtcEndpoint implements IWebRtcEndpoint {
    constructor(
        peerInfo: PeerInfo,
        stunUrls: string[],
        rtcSignaller: RtcSignaller,
        metricsContext: MetricsContext,
        negotiatedProtocolVersions: NegotiatedProtocolVersions,
        newConnectionTimeout = 15000,
        pingInterval = 2 * 1000,
        webrtcDatachannelBufferThresholdLow = 2 ** 15,
        webrtcDatachannelBufferThresholdHigh = 2 ** 17,
        maxMessageSize = 1048576
    ) {
        super( peerInfo,
            stunUrls,
            rtcSignaller,
            metricsContext,
            negotiatedProtocolVersions,
            newConnectionTimeout,
            pingInterval,
            webrtcDatachannelBufferThresholdLow,
            webrtcDatachannelBufferThresholdHigh,
            maxMessageSize)
    }

    protected doCreateConnection(opts: ConstructorOptions): WebRtcConnection {
        return new NodeWebRtcConnection(opts)
    }
    protected doStop(): void {
        nodeDataChannel.cleanup()
    }
}
