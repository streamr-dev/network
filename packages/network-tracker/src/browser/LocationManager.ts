import { Logger } from 'streamr-network/dist/src/helpers/Logger'
import { Location, NodeId } from 'streamr-network/dist/src/identifiers'

function isValidNodeLocation(location: Location | null) {
    return location && (location.country || location.city || location.latitude || location.longitude)
}

export class LocationManager {
    private readonly nodeLocations: Record<NodeId, Location>
    private readonly logger: Logger

    constructor() {
        this.nodeLocations = {}
        this.logger = new Logger(module)
    }

    getAllNodeLocations(): Readonly<Record<NodeId, Location>> {
        return this.nodeLocations
    }

    getNodeLocation(nodeId: NodeId): Location {
        return this.nodeLocations[nodeId]
    }

    updateLocation({ nodeId, location }: { nodeId: NodeId, location: Location | null, address: string }): void {
        if (isValidNodeLocation(location)) {
            this.nodeLocations[nodeId] = location!
        }
    }

    removeNode(nodeId: NodeId): void {
        delete this.nodeLocations[nodeId]
    }
}
