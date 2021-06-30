import { lookup, Lookup } from 'geoip-lite'
import { Logger } from '../helpers/Logger'
import { Location } from '../identifiers'

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

    updateLocation({ nodeId, location, address }: { nodeId: string, location: Location | null, address: string }): void {
        if (isValidNodeLocation(location)) {
            this.nodeLocations[nodeId] = location!
        } else if (!isValidNodeLocation(this.nodeLocations[nodeId])) {
            let geoIpRecord: null | Lookup = null
            if (address) {
                geoIpRecord = lookup(address)
            }
            if (geoIpRecord) {
                this.nodeLocations[nodeId] = {
                    country: geoIpRecord.country,
                    city: geoIpRecord.city,
                    latitude: geoIpRecord.ll[0],
                    longitude: geoIpRecord.ll[1]
                }
            }
        }
    }

    removeNode(nodeId: string): void {
        delete this.nodeLocations[nodeId]
    }
}
