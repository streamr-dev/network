import { AbstractNodeOptions } from './identifiers';
import { NetworkNode } from './logic/NetworkNode';
import { TrackerRegistryRecord } from '@streamr/protocol';
import { ExternalIP, IceServer, WebRtcPortRange } from './connection/webrtc/WebRtcConnection';
export interface NetworkNodeOptions extends AbstractNodeOptions {
    trackers: TrackerRegistryRecord[];
    disconnectionWaitTime: number;
    peerPingInterval: number;
    newWebrtcConnectionTimeout: number;
    webrtcDatachannelBufferThresholdLow: number;
    webrtcDatachannelBufferThresholdHigh: number;
    webrtcSendBufferMaxMessageCount: number;
    iceServers: ReadonlyArray<IceServer>;
    rttUpdateTimeout: number;
    trackerConnectionMaintenanceInterval: number;
    webrtcDisallowPrivateAddresses: boolean;
    acceptProxyConnections: boolean;
    webrtcMaxMessageSize: number;
    webrtcPortRange: WebRtcPortRange;
    externalIp?: ExternalIP;
}
export declare const TEST_CONFIG: Omit<NetworkNodeOptions, 'id' | 'trackers' | 'metricsContext'>;
export declare const createNetworkNode: ({ id, location, trackers, metricsContext, peerPingInterval, trackerPingInterval, disconnectionWaitTime, newWebrtcConnectionTimeout, rttUpdateTimeout, webrtcDatachannelBufferThresholdLow, webrtcDatachannelBufferThresholdHigh, webrtcSendBufferMaxMessageCount, iceServers, trackerConnectionMaintenanceInterval, webrtcDisallowPrivateAddresses, acceptProxyConnections, webrtcPortRange, webrtcMaxMessageSize, externalIp }: NetworkNodeOptions) => NetworkNode;
