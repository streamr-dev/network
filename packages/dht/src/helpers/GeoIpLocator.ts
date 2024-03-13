import { filePathToNodeFormat } from '@streamr/utils'
import fs from 'fs'
import { CityResponse, Reader } from 'mmdb-lib'

interface GeoIpLookupResult {
    latitude: number
    longitude: number
}

export class GeoIpLocator {
    private readonly reader: Reader<CityResponse>

    constructor(geoiIpDatabasePath: string) {
        // Get a buffer with mmdb database, from file system or whereever.
        const db = fs.readFileSync(filePathToNodeFormat(geoiIpDatabasePath))

        this.reader = new Reader<CityResponse>(db)
    }

    lookup(ip: string): GeoIpLookupResult | undefined {
        const result = this.reader.get(ip)
        if (!result || !result.location || !result.location.latitude || !result.location.longitude) {
            return undefined
        } else {
            return {
                latitude: result.location.latitude,
                longitude: result.location.longitude
            }
        }
    }
}
