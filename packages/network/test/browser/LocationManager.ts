import { Logger } from '../../src/helpers/Logger'
import { Location } from '../../src/identifiers'

function isValidNodeLocation(location: Location | null) {
    return location && (location.country || location.city || location.latitude || location.longitude)
}

export class LocationManager {
    private readonly nodeLocations: {
        [key: string]: Location // nodeId => Location
    }
    private readonly logger: Logger

    constructor() {
        this.nodeLocations = {}
        this.logger = new Logger(module)
    }

    getAllNodeLocations(): Readonly<{[key: string]: Location}> {
        return this.nodeLocations
    }

    getNodeLocation(nodeId: string): Location {
        return this.nodeLocations[nodeId]
    }

    updateLocation({ nodeId, location }: { nodeId: string, location: Location | null, address: string }): void {
        if (isValidNodeLocation(location)) {
            this.nodeLocations[nodeId] = location!
        }
    }

    removeNode(nodeId: string): void {
        delete this.nodeLocations[nodeId]
    }
}
