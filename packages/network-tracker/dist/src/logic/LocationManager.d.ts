import { Location, NodeId } from 'streamr-network';
export declare class LocationManager {
    private readonly nodeLocations;
    private readonly logger;
    constructor();
    getAllNodeLocations(): Readonly<Record<NodeId, Location>>;
    getNodeLocation(nodeId: NodeId): Location;
    updateLocation({ nodeId, location, address }: {
        nodeId: NodeId;
        location?: Location;
        address?: string;
    }): void;
    removeNode(nodeId: NodeId): void;
}
