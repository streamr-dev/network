/// <reference types="node" />
import { EventEmitter } from 'events';
import { IWebRtcEndpoint } from './IWebRtcEndpoint';
import { PeerId, PeerInfo } from '../PeerInfo';
import { WebRtcConnection, ConstructorOptions, IceServer, WebRtcPortRange, ExternalIP } from './WebRtcConnection';
import { MetricsContext } from '@streamr/utils';
import { RtcSignaller } from '../../logic/RtcSignaller';
import { Rtts } from '../../identifiers';
import { NegotiatedProtocolVersions } from '../NegotiatedProtocolVersions';
export interface WebRtcConnectionFactory {
    createConnection(opts: ConstructorOptions): WebRtcConnection;
    registerWebRtcEndpoint(): void;
    unregisterWebRtcEndpoint(): void;
}
export declare class WebRtcEndpoint extends EventEmitter implements IWebRtcEndpoint {
    private readonly peerInfo;
    private readonly iceServers;
    private readonly rtcSignaller;
    private readonly negotiatedProtocolVersions;
    private readonly connectionFactory;
    private connections;
    private messageQueues;
    private readonly newConnectionTimeout;
    private readonly pingInterval;
    private readonly metrics;
    private stopped;
    private readonly bufferThresholdLow;
    private readonly bufferThresholdHigh;
    private readonly sendBufferMaxMessageCount;
    private readonly disallowPrivateAddresses;
    private readonly maxMessageSize;
    private readonly portRange;
    private readonly externalIp?;
    private statusReportTimer?;
    constructor(peerInfo: PeerInfo, iceServers: ReadonlyArray<IceServer>, rtcSignaller: RtcSignaller, metricsContext: MetricsContext, negotiatedProtocolVersions: NegotiatedProtocolVersions, connectionFactory: WebRtcConnectionFactory, newConnectionTimeout: number, pingInterval: number, webrtcDatachannelBufferThresholdLow: number, webrtcDatachannelBufferThresholdHigh: number, webrtcSendBufferMaxMessageCount: number, webrtcDisallowPrivateAddresses: boolean, portRange: WebRtcPortRange, maxMessageSize: number, externalIp?: ExternalIP);
    private startConnectionStatusReport;
    private createConnection;
    private onRtcOfferFromSignaller;
    private onRtcAnswerFromSignaller;
    isIceCandidateAllowed(candidate: string): boolean;
    private onIceCandidateFromSignaller;
    private onErrorFromSignaller;
    private onConnectFromSignaller;
    private replaceConnection;
    connect(targetPeerId: PeerId, routerId: string, trackerInstructed?: boolean): Promise<PeerId>;
    send(targetPeerId: PeerId, message: string): Promise<void>;
    private attemptProtocolVersionValidation;
    close(receiverPeerId: PeerId, reason: string): void;
    getRtts(): Readonly<Rtts>;
    getPeerInfo(): Readonly<PeerInfo>;
    getNegotiatedMessageLayerProtocolVersionOnNode(peerId: PeerId): number | undefined;
    getNegotiatedControlLayerProtocolVersionOnNode(peerId: PeerId): number | undefined;
    getDefaultMessageLayerProtocolVersion(): number;
    getDefaultControlLayerProtocolVersion(): number;
    /**
     * @deprecated
     */
    getAddress(): string;
    stop(): void;
    getAllConnectionNodeIds(): PeerId[];
    getDiagnosticInfo(): Record<string, unknown>;
    private onConnectionCountChange;
}
