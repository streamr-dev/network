import type { GeoIpLocator } from '@streamr/geoip-location'

export const createGeoipLocator = (_geoIpDatabaseFolder: string): Promise<GeoIpLocator> => {
    throw new Error('GeoIpLocator is not supported in browser environment')
}
