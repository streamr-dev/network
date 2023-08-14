/// <reference types="node" />
import { EventEmitter } from 'events';
import { ErrorMessage, InstructionMessage, RelayMessage, StatusAckMessage, TrackerMessage } from '@streamr/protocol';
import { Status, NodeId, TrackerId } from '../identifiers';
import { PeerInfo } from '../connection/PeerInfo';
import { AbstractClientWsEndpoint } from "../connection/ws/AbstractClientWsEndpoint";
import { AbstractWsConnection } from "../connection/ws/AbstractWsConnection";
export declare enum Event {
    CONNECTED_TO_TRACKER = "streamr:tracker-node:send-status",
    TRACKER_DISCONNECTED = "streamr:tracker-node:tracker-disconnected",
    TRACKER_INSTRUCTION_RECEIVED = "streamr:tracker-node:tracker-instruction-received",
    STATUS_ACK_RECEIVED = "streamr:tracker-node:status-ack-received",
    RELAY_MESSAGE_RECEIVED = "streamr:tracker-node:relay-message-received",
    RTC_ERROR_RECEIVED = "streamr:tracker-node:rtc-error-received"
}
export interface NodeToTracker {
    on(event: Event.CONNECTED_TO_TRACKER, listener: (trackerId: TrackerId) => void): this;
    on(event: Event.TRACKER_DISCONNECTED, listener: (trackerId: TrackerId) => void): this;
    on(event: Event.TRACKER_INSTRUCTION_RECEIVED, listener: (msg: InstructionMessage, trackerId: TrackerId) => void): this;
    on(event: Event.STATUS_ACK_RECEIVED, listener: (msg: StatusAckMessage, trackerId: TrackerId) => void): this;
    on(event: Event.RELAY_MESSAGE_RECEIVED, listener: (msg: RelayMessage, trackerId: TrackerId) => void): this;
    on(event: Event.RTC_ERROR_RECEIVED, listener: (msg: ErrorMessage, trackerId: TrackerId) => void): this;
}
export type UUID = string;
export declare class NodeToTracker extends EventEmitter {
    private readonly endpoint;
    constructor(endpoint: AbstractClientWsEndpoint<AbstractWsConnection>);
    sendStatus(trackerId: TrackerId, status: Status): Promise<UUID>;
    sendRtcOffer(trackerId: TrackerId, targetNode: NodeId, connectionId: string, originatorInfo: PeerInfo, description: string): Promise<UUID>;
    sendRtcAnswer(trackerId: TrackerId, targetNode: NodeId, connectionId: string, originatorInfo: PeerInfo, description: string): Promise<UUID>;
    sendRtcIceCandidate(trackerId: TrackerId, targetNode: NodeId, connectionId: string, originatorInfo: PeerInfo, candidate: string, mid: string): Promise<UUID>;
    sendRtcConnect(trackerId: TrackerId, targetNode: NodeId, originatorInfo: PeerInfo): Promise<UUID>;
    send<T>(receiverTrackerId: TrackerId, message: T & TrackerMessage): Promise<void>;
    getServerUrlByTrackerId(trackerId: TrackerId): string | undefined;
    getDiagnosticInfo(): Record<string, unknown>;
    stop(): Promise<void>;
    onMessageReceived(peerInfo: PeerInfo, rawMessage: string): void;
    connectToTracker(trackerAddress: string, trackerPeerInfo: PeerInfo): Promise<TrackerId>;
    disconnectFromTracker(trackerId: string): void;
    onPeerConnected(peerInfo: PeerInfo): void;
    onPeerDisconnected(peerInfo: PeerInfo): void;
}
