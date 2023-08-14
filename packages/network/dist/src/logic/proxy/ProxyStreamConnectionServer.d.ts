import { StreamPartManager } from '../StreamPartManager';
import { NodeToNode } from '../../protocol/NodeToNode';
import { NodeId } from '../../identifiers';
import { Node } from '../Node';
import { StreamPartID } from '@streamr/protocol';
import { Propagation } from '../propagation/Propagation';
export interface ProxyStreamConnectionServerOptions {
    streamPartManager: StreamPartManager;
    nodeToNode: NodeToNode;
    propagation: Propagation;
    node: Node;
    acceptProxyConnections: boolean;
}
export declare class ProxyStreamConnectionServer {
    private readonly connections;
    private readonly acceptProxyConnections;
    private readonly streamPartManager;
    private readonly nodeToNode;
    private readonly node;
    private readonly propagation;
    constructor(opts: ProxyStreamConnectionServerOptions);
    private processHandshakeRequest;
    private addConnection;
    private processLeaveRequest;
    private removeConnection;
    private hasConnection;
    getNodeIdsForUserId(streamPartId: StreamPartID, userId: string): NodeId[];
    stop(): void;
}
