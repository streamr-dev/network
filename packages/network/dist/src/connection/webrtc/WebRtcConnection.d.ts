import { EventEmitter } from 'events';
import StrictEventEmitter from 'strict-event-emitter-types';
import { DeferredConnectionAttempt } from './DeferredConnectionAttempt';
import { PeerId, PeerInfo } from '../PeerInfo';
import { MessageQueue } from '../MessageQueue';
export interface IceServer {
    url: string;
    port: number;
    username?: string;
    password?: string;
    tcp?: boolean;
}
export interface ConstructorOptions {
    selfId: PeerId;
    targetPeerId: PeerId;
    routerId: string;
    iceServers: ReadonlyArray<IceServer>;
    pingInterval: number;
    messageQueue: MessageQueue<string>;
    deferredConnectionAttempt: DeferredConnectionAttempt;
    portRange: WebRtcPortRange;
    maxMessageSize: number;
    externalIp?: ExternalIP;
    bufferThresholdLow?: number;
    bufferThresholdHigh?: number;
    newConnectionTimeout?: number;
    maxPingPongAttempts?: number;
    flushRetryTimeout?: number;
}
export interface WebRtcPortRange {
    min: number;
    max: number;
}
export type ExternalIP = string;
/**
 * Strict types for EventEmitter interface.
 */
interface Events {
    localDescription: (type: any, description: string) => void;
    localCandidate: (candidate: string, mid: string) => void;
    open: () => void;
    message: (msg: string) => void;
    close: (err?: Error) => void;
    error: (err: Error) => void;
    bufferLow: () => void;
    bufferHigh: () => void;
    failed: () => void;
}
export declare const ConnectionEmitter: new () => StrictEventEmitter<EventEmitter, Events>;
export declare function isOffering(myId: PeerId, theirId: PeerId): boolean;
/**
 * Shared base class for WebRTC connections implemented in different libraries.
 * Encapsulates the common needs of such connections such as:
 *
 *  - Determining offerer / answerer roles upon connecting
 *  - Connection timeout
 *  - Message queueing and retries on message delivery failures
 *  - Backpressure handling
 *  - Ping/Pong mechanism for RTT calculation and dead connection detection
 *  - Deferred promise handling in case of connection re-attempts
 *  - Closing of connection and associated clean up
 *  - Ensuring event loop isn't greedily reserved for long periods of time
 *
 *  Implementers of this base class should make sure to implement the
 *  abstract methods. Implementers should also make sure their base classes
 *  invoke all "emit"-prefixed protected methods:
 *  - emitOpen
 *  - emitLocalDescription
 *  - emitLocalCandidate
 *  - emitMessage
 *  - emitLowBackpressure
 *
 *  See the respective JSDocs for more information.
 *
 */
export declare abstract class WebRtcConnection extends ConnectionEmitter {
    private readonly maxPingPongAttempts;
    private readonly pingInterval;
    private readonly flushRetryTimeout;
    private readonly messageQueue;
    private readonly baseLogger;
    private connectionId;
    private peerInfo;
    private flushRef;
    private flushTimeoutRef;
    private connectionTimeoutRef;
    private deferredConnectionAttempt;
    private readonly newConnectionTimeout;
    private paused;
    private isFinished;
    private pingTimeoutRef;
    private pingAttempts;
    private rtt;
    private rttStart;
    private hasOpened;
    protected readonly id: string;
    protected readonly maxMessageSize: number;
    protected readonly selfId: PeerId;
    protected readonly iceServers: ReadonlyArray<IceServer>;
    protected readonly bufferThresholdHigh: number;
    protected readonly bufferThresholdLow: number;
    protected readonly portRange: WebRtcPortRange;
    protected readonly externalIp?: ExternalIP;
    private messagesSent;
    private messagesRecv;
    private bytesSent;
    private bytesRecv;
    private sendFailures;
    private openSince;
    constructor({ selfId, targetPeerId, iceServers, messageQueue, deferredConnectionAttempt, pingInterval, portRange, maxMessageSize, externalIp, bufferThresholdHigh, bufferThresholdLow, newConnectionTimeout, maxPingPongAttempts, flushRetryTimeout }: ConstructorOptions);
    connect(): void;
    getDeferredConnectionAttempt(): DeferredConnectionAttempt | null;
    stealDeferredConnectionAttempt(): DeferredConnectionAttempt | null;
    close(err?: Error): void;
    protected emitClose(reason: Error | string): void;
    getConnectionId(): string;
    setConnectionId(id: string): void;
    send(message: string): Promise<void>;
    setPeerInfo(peerInfo: PeerInfo): void;
    getPeerInfo(): PeerInfo;
    getPeerId(): PeerId;
    getRtt(): number | null;
    ping(): void;
    pong(): void;
    isOffering(): boolean;
    getDiagnosticInfo(): Record<string, unknown>;
    private setFlushRef;
    private attemptToFlushMessages;
    private processFailedMessage;
    abstract setRemoteDescription(description: string, type: string): void;
    abstract addRemoteCandidate(candidate: string, mid: string): void;
    abstract getBufferedAmount(): number;
    abstract getMaxMessageSize(): number;
    abstract isOpen(): boolean;
    protected abstract doConnect(): void;
    protected abstract doClose(err?: Error): void;
    abstract getLastState(): string | undefined;
    abstract getLastGatheringState(): string | undefined;
    /**
     * Invoked when a message is ready to be sent. Connectivity is ensured
     * with a check to `isOpen` before invocation.
     * @param message - mesasge to be sent
     */
    protected abstract doSendMessage(message: string): void;
    /**
     * Subclass should call this method when the connection has opened.
     */
    protected emitOpen(): void;
    /**
     * Subclass should call this method when a new local description is available.
     */
    protected emitLocalDescription(description: string, type: string): void;
    /**
     * Subclass should call this method when a new local candidate is available.
     */
    protected emitLocalCandidate(candidate: string, mid: string): void;
    /**
     * Subclass should call this method when it has received a message.
     */
    protected emitMessage(msg: string): void;
    /**
     * Subclass should call this method when backpressure has reached low watermark.
     */
    protected emitLowBackpressure(): void;
    /**
     * Forcefully restart the connection timeout (e.g. on state change) from subclass.
     */
    protected restartConnectionTimeout(): void;
}
export {};
