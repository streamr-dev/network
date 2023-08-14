/// <reference types="node" />
import { EventEmitter } from 'events';
import { ProxyDirection, StreamMessage, StreamPartID } from '@streamr/protocol';
import { NodeToNode } from '../protocol/NodeToNode';
import { NodeToTracker } from '../protocol/NodeToTracker';
import { MetricsContext } from '@streamr/utils';
import { StreamPartManager } from './StreamPartManager';
import { PeerInfo } from '../connection/PeerInfo';
import type { NodeId, TrackerId } from '../identifiers';
import { TrackerManagerOptions } from './TrackerManager';
export declare enum Event {
    NODE_CONNECTED = "streamr:node:node-connected",
    NODE_DISCONNECTED = "streamr:node:node-disconnected",
    MESSAGE_RECEIVED = "streamr:node:message-received",
    UNSEEN_MESSAGE_RECEIVED = "streamr:node:unseen-message-received",
    DUPLICATE_MESSAGE_RECEIVED = "streamr:node:duplicate-message-received",
    NODE_SUBSCRIBED = "streamr:node:subscribed-successfully",
    NODE_UNSUBSCRIBED = "streamr:node:node-unsubscribed",
    ONE_WAY_CONNECTION_CLOSED = "stream:node-one-way-connection-closed",
    JOIN_COMPLETED = "stream:node-stream-join-operation-completed",
    JOIN_FAILED = "stream:node-stream-join-operation-failed"
}
export interface NodeOptions extends TrackerManagerOptions {
    protocols: {
        nodeToNode: NodeToNode;
        nodeToTracker: NodeToTracker;
    };
    peerInfo: PeerInfo;
    metricsContext?: MetricsContext;
    bufferTimeoutInMs?: number;
    bufferMaxSize?: number;
    disconnectionWaitTime: number;
    nodeConnectTimeout?: number;
    acceptProxyConnections: boolean;
}
export interface Node {
    on(event: Event.NODE_CONNECTED, listener: (nodeId: NodeId) => void): this;
    on(event: Event.NODE_DISCONNECTED, listener: (nodeId: NodeId) => void): this;
    on<T>(event: Event.MESSAGE_RECEIVED, listener: (msg: StreamMessage<T>, nodeId: NodeId | null) => void): this;
    on<T>(event: Event.UNSEEN_MESSAGE_RECEIVED, listener: (msg: StreamMessage<T>, nodeId: NodeId | null) => void): this;
    on<T>(event: Event.DUPLICATE_MESSAGE_RECEIVED, listener: (msg: StreamMessage<T>, nodeId: NodeId | null) => void): this;
    on(event: Event.NODE_SUBSCRIBED, listener: (nodeId: NodeId, streamPartId: StreamPartID) => void): this;
    on(event: Event.NODE_UNSUBSCRIBED, listener: (nodeId: NodeId, streamPartId: StreamPartID) => void): this;
    on(event: Event.ONE_WAY_CONNECTION_CLOSED, listener: (nodeId: NodeId, streamPartId: StreamPartID) => void): this;
    on(event: Event.JOIN_COMPLETED, listener: (streamPartId: StreamPartID, numOfNeighbors: number) => void): this;
    on(event: Event.JOIN_FAILED, listener: (streamPartId: StreamPartID, error: string) => void): this;
}
export declare class Node extends EventEmitter {
    readonly peerInfo: PeerInfo;
    protected readonly nodeToNode: NodeToNode;
    private readonly nodeConnectTimeout;
    private readonly started;
    protected readonly streamPartManager: StreamPartManager;
    private readonly disconnectionManager;
    private readonly propagation;
    private readonly trackerManager;
    private readonly consecutiveDeliveryFailures;
    private readonly metricsContext;
    private readonly metrics;
    protected extraMetadata: Record<string, unknown>;
    protected readonly acceptProxyConnections: boolean;
    private readonly proxyStreamConnectionClient;
    private readonly proxyStreamConnectionServer;
    constructor(opts: NodeOptions);
    start(): void;
    subscribeToStreamIfHaveNotYet(streamPartId: StreamPartID, sendStatus?: boolean): void;
    unsubscribeFromStream(streamPartId: StreamPartID, sendStatus?: boolean): void;
    subscribeToStreamPartOnNodes(nodeIds: NodeId[], streamPartId: StreamPartID, trackerId: TrackerId, reattempt: boolean): Promise<PromiseSettledResult<NodeId>[]>;
    doSetProxies(streamPartId: StreamPartID, contactNodeIds: NodeId[], direction: ProxyDirection, getUserId: () => Promise<string>, connectionCount?: number): Promise<void>;
    onDataReceived(streamMessage: StreamMessage, source?: NodeId | null): void | never;
    stop(): Promise<unknown>;
    private getPropagationTargets;
    private subscribeToStreamPartOnNode;
    private unsubscribeFromStreamPartOnNode;
    private onNodeDisconnected;
    getStreamParts(): Iterable<StreamPartID>;
    getNeighbors(): ReadonlyArray<NodeId>;
    getNodeId(): NodeId;
    getMetricsContext(): MetricsContext;
    getDiagnosticInfo(): Record<string, unknown>;
    subscribeAndWaitForJoinOperation(streamPartId: StreamPartID, timeout?: number): Promise<number>;
    emitJoinCompleted(streamPartId: StreamPartID, numOfNeighbors: number): void;
    emitJoinFailed(streamPartId: StreamPartID, error: string): void;
    isProxiedStreamPart(streamPartId: StreamPartID, direction: ProxyDirection): boolean;
}
