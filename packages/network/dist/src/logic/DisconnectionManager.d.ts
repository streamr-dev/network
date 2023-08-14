import { NodeId } from '../identifiers';
type GetAllNodesFn = () => ReadonlyArray<NodeId>;
type HasSharedStreamPartsFn = (nodeId: NodeId) => boolean;
type DisconnectFn = (nodeId: NodeId, reason: string) => void;
export interface DisconnectionManagerOptions {
    getAllNodes: GetAllNodesFn;
    hasSharedStreamParts: HasSharedStreamPartsFn;
    disconnect: DisconnectFn;
    disconnectionDelayInMs: number;
    cleanUpIntervalInMs: number;
}
/**
 * DisconnectionManager assists a network node in disconnecting from other nodes when streams are
 * no longer shared between them.
 *
 * There are two ways this is achieved:
 *  1. Manual: a node can schedule (and cancel) disconnections that get executed after `disconnectionDelayInMs` if
 *      they still don't share streams.
 *  2. Automatic: a clean up interval is ran periodically in which any node without shared streams gets disconnected
 *      from.
 */
export declare class DisconnectionManager {
    static DISCONNECTION_REASON: string;
    private readonly disconnectionTimers;
    private readonly getAllNodes;
    private readonly hasSharedStreams;
    private readonly disconnect;
    private readonly disconnectionDelayInMs;
    private readonly cleanUpIntervalInMs;
    private connectionCleanUpInterval;
    constructor({ getAllNodes, hasSharedStreamParts: hasSharedStreams, disconnect, disconnectionDelayInMs, cleanUpIntervalInMs }: DisconnectionManagerOptions);
    start(): void;
    stop(): void;
    scheduleDisconnectionIfNoSharedStreamParts(nodeId: NodeId): void;
    cancelScheduledDisconnection(nodeId: NodeId): void;
    private loggedDisconnect;
}
export {};
