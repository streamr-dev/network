// This package is nodejs only, provide an empty implementation for the browser
/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-useless-constructor, 
    class-methods-use-this */
interface GeoIpLookupResult {
    latitude: number
    longitude: number
}
export class GeoIpLocator {
    constructor(geoiIpDatabasePath: string, dbCheckInterval: number = 30 * 24 * 60 * 60 * 1000,
        dbCheckErrorInterval: number = 24 * 60 * 60 * 1000) {
    }

    private checkDatabase: () => Promise<void> = async () => {
    }

    private scheduleCheck: (timeout: number) => void = async (timeout: number) => {
    }

    async start(): Promise<void> {
    }

    stop(): void {
    }

    lookup(ip: string): GeoIpLookupResult | undefined {
        return undefined
    }
}
