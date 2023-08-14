/// <reference types="node" />
/// <reference types="node" />
import { EventEmitter } from "events";
import { PeerId, PeerInfo } from "../PeerInfo";
import { Rtts } from "../../identifiers";
import { AbstractWsConnection } from './AbstractWsConnection';
export declare enum Event {
    PEER_CONNECTED = "streamr:peer:connect",
    PEER_DISCONNECTED = "streamr:peer:disconnect",
    MESSAGE_RECEIVED = "streamr:message-received",
    HIGH_BACK_PRESSURE = "streamr:high-back-pressure",
    LOW_BACK_PRESSURE = "streamr:low-back-pressure"
}
export declare enum DisconnectionCode {
    GRACEFUL_SHUTDOWN = 1000,
    FAILED_HANDSHAKE = 4000,
    DEAD_CONNECTION = 4001,
    DUPLICATE_SOCKET = 4002,
    INVALID_PROTOCOL_MESSAGE = 4003
}
export declare enum DisconnectionReason {
    GRACEFUL_SHUTDOWN = "streamr:node:graceful-shutdown",
    DUPLICATE_SOCKET = "streamr:endpoint:duplicate-connection",
    NO_SHARED_STREAM_PARTS = "streamr:node:no-shared-stream-parts",
    DEAD_CONNECTION = "dead connection",
    INVALID_PROTOCOL_MESSAGE = "streamr:protocol:invalid-protocol-message"
}
export declare class UnknownPeerError extends Error {
    static CODE: string;
    readonly code: string;
}
export declare abstract class AbstractWsEndpoint<C extends AbstractWsConnection> extends EventEmitter {
    private readonly pingPongWs;
    private readonly connectionById;
    private stopped;
    protected handshakeTimeoutRefs: Record<PeerId, NodeJS.Timeout>;
    protected readonly peerInfo: PeerInfo;
    protected readonly handshakeTimer: number;
    protected constructor(peerInfo: PeerInfo, pingInterval: number);
    send(recipientId: PeerId, message: string): Promise<void>;
    close(recipientId: PeerId, code: DisconnectionCode, reason: DisconnectionReason): void;
    stop(): Promise<void>;
    getRtts(): Rtts;
    getPeers(): ReadonlyMap<PeerId, C>;
    getPeerInfos(): PeerInfo[];
    clearHandshake(id: PeerId): void;
    /**
     * Custom close logic of subclass
     */
    protected abstract doClose(connection: C, code: DisconnectionCode, reason: DisconnectionReason): void;
    /**
     * Custom clean up logic of subclass
     */
    protected abstract doStop(): Promise<void>;
    /**
     * Implementer should invoke this whenever a new connection is formed
     */
    protected onNewConnection(connection: C): void;
    /**
     * Implementer should invoke this whenever a message is received.
     */
    protected onReceive(connection: AbstractWsConnection, message: string): void;
    /**
     * Implementer should invoke this whenever a connection is closed.
     */
    protected onClose(connection: C, code: DisconnectionCode, reason: DisconnectionReason): void;
    protected getConnections(): C[];
    protected getConnectionByPeerId(peerId: PeerId): C | undefined;
    private emitLowBackPressure;
    private emitHighBackPressure;
}
