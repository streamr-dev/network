import { Location, NodeId } from 'streamr-network/dist/src/identifiers';
export declare class LocationManager {
    private readonly nodeLocations;
    private readonly logger;
    constructor();
    getAllNodeLocations(): Readonly<Record<NodeId, Location>>;
    getNodeLocation(nodeId: NodeId): Location;
    updateLocation({ nodeId, location }: {
        nodeId: NodeId;
        location: Location | null;
        address: string;
    }): void;
    removeNode(nodeId: NodeId): void;
}
