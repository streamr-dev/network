import { NodeId } from 'streamr-network';
export declare type TopologyState = Record<NodeId, Array<NodeId>>;
export declare type Instructions = Record<NodeId, NodeId[]>;
export declare type TopologyNodes = Record<NodeId, Set<NodeId>>;
export declare class OverlayTopology {
    private readonly maxNeighborsPerNode;
    private readonly shuffleArray;
    private readonly pickRandomElement;
    private readonly nodes;
    private readonly nodesWithOpenSlots;
    constructor(maxNeighborsPerNode: number, shuffleArrayFunction?: <T>(arr: T[]) => T[], pickRandomElementFunction?: <T>(arr: T[]) => T);
    getNeighbors(nodeId: NodeId): Set<NodeId>;
    getNumberOfNodes(): number;
    hasNode(nodeId: NodeId): boolean;
    update(nodeId: NodeId, neighbors: NodeId[]): void;
    leave(nodeId: NodeId): NodeId[];
    isEmpty(): boolean;
    getNodes(): TopologyNodes;
    state(): TopologyState;
    formInstructions(nodeId: NodeId, forceGenerate?: boolean): Instructions;
    private checkOpenSlots;
    private numOfMissingNeighbors;
}
