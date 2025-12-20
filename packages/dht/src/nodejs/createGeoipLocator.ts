import { GeoIpLocator } from '@streamr/geoip-location'

export const createGeoipLocator = async (
    geoIpDatabaseFolder: string
): Promise<GeoIpLocator> => {
    const geoIpLocator = new GeoIpLocator(geoIpDatabaseFolder)

    await geoIpLocator.start()

    return geoIpLocator
}
