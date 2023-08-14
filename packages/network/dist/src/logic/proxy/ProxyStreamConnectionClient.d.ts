/// <reference types="node" />
/// <reference types="node" />
import { TrackerManager } from '../TrackerManager';
import { StreamPartManager } from '../StreamPartManager';
import { NodeToNode } from '../../protocol/NodeToNode';
import { NodeId } from '../../identifiers';
import { Node } from '../Node';
import { ProxyDirection, StreamPartID } from '@streamr/protocol';
import { Propagation } from '../propagation/Propagation';
import { EventEmitter } from "events";
export interface ProxyStreamConnectionClientOptions {
    trackerManager: TrackerManager;
    streamPartManager: StreamPartManager;
    nodeToNode: NodeToNode;
    propagation: Propagation;
    node: Node;
    nodeConnectTimeout: number;
}
export declare enum Event {
    CONNECTION_ACCEPTED = "proxy-connection-accepted",
    CONNECTION_REJECTED = "proxy-connection-rejected"
}
export interface ProxyStreamConnectionClient {
    on(event: Event.CONNECTION_ACCEPTED, listener: (nodeId: NodeId, streamPartId: StreamPartID, direction: ProxyDirection) => void): this;
    on(event: Event.CONNECTION_REJECTED, listener: (nodeId: NodeId, streamPartId: StreamPartID, direction: ProxyDirection, reason?: string) => void): this;
}
export declare const retry: <T>(task: () => Promise<T>, description: string, abortSignal: AbortSignal, delay?: number) => Promise<T>;
export declare class ProxyStreamConnectionClient extends EventEmitter {
    private readonly connections;
    private readonly definitions;
    private readonly nodeConnectTimeout;
    private readonly trackerManager;
    private readonly streamPartManager;
    private readonly nodeToNode;
    private readonly node;
    private readonly propagation;
    private readonly abortController;
    constructor(opts: ProxyStreamConnectionClientOptions);
    setProxies(streamPartId: StreamPartID, nodeIds: NodeId[], direction: ProxyDirection, getUserId: () => Promise<string>, connectionCount?: number): Promise<void>;
    private updateConnections;
    private getInvalidConnections;
    private openRandomConnections;
    private attemptConnection;
    private waitForHandshake;
    private initiateConnection;
    private connectAndHandshake;
    private closeRandomConnections;
    private closeConnection;
    private getConnections;
    private hasConnection;
    private removeConnection;
    private processHandshakeResponse;
    onNodeDisconnected(streamPartId: StreamPartID, nodeId: NodeId): Promise<void>;
    isProxiedStreamPart(streamPartId: StreamPartID, direction: ProxyDirection): boolean;
    stop(): void;
}
