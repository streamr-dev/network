import { StreamMessage, StreamPartID, ProxyDirection } from '@streamr/protocol';
import { Node, NodeOptions } from './Node';
import { NodeId } from '../identifiers';
export declare class NetworkNode extends Node {
    constructor(opts: NodeOptions);
    setExtraMetadata(metadata: Record<string, unknown>): void;
    publish(streamMessage: StreamMessage): void | never;
    setProxies(streamPartId: StreamPartID, contactNodeIds: NodeId[], direction: ProxyDirection, getUserId: () => Promise<string>, connectionCount?: number): Promise<void>;
    addMessageListener<T>(cb: (msg: StreamMessage<T>) => void): void;
    removeMessageListener<T>(cb: (msg: StreamMessage<T>) => void): void;
    subscribe(streamPartId: StreamPartID): void;
    subscribeAndWaitForJoin(streamPartId: StreamPartID, timeout?: number): Promise<number>;
    waitForJoinAndPublish(streamMessage: StreamMessage, timeout?: number): Promise<number>;
    unsubscribe(streamPartId: StreamPartID): void;
    getNeighborsForStreamPart(streamPartId: StreamPartID): ReadonlyArray<NodeId>;
    hasStreamPart(streamPartId: StreamPartID): boolean;
    hasProxyConnection(streamPartId: StreamPartID, contactNodeId: NodeId, direction: ProxyDirection): boolean;
    getRtt(nodeId: NodeId): number | undefined;
}
