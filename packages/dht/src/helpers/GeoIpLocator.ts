import { Logger, filePathToNodeFormat } from '@streamr/utils'
import fs from 'fs'
import { CityResponse, Reader } from 'mmdb-lib'
import LongTimeout from 'long-timeout'

const logger = new Logger(module)
interface GeoIpLookupResult {
    latitude: number
    longitude: number
}
export class GeoIpLocator {
    private geolite?: typeof import('geolite2-redist', { with: { "resolution-mode": "import" } })
    private readonly geoiIpDatabasePath: string
    private readonly dbCheckIntervalLength: number
    private reader?: Reader<CityResponse>
    private dbCheckInterval?: LongTimeout.Timeout

    // By default, check the database every 30 days

    constructor(geoiIpDatabasePath: string, dbCheckIntervalLength: number = 30 * 24 * 60 * 60 * 1000) {
        this.dbCheckIntervalLength = dbCheckIntervalLength
        if (!geoiIpDatabasePath.endsWith('/')) {
            geoiIpDatabasePath += '/'
        }
        this.geoiIpDatabasePath = filePathToNodeFormat(geoiIpDatabasePath)
    }

    private checkDatabase: () => Promise<void> = async () => {
        await this.geolite!.downloadDbs({ path: this.geoiIpDatabasePath, dbList: [this.geolite!.GeoIpDbName.City] })
        this.reader = new Reader<CityResponse>(fs.readFileSync(this.geoiIpDatabasePath + '/' + this.geolite!.GeoIpDbName.City + '.mmdb'))
    }

    async start(): Promise<void> {
        if (this.geolite !== undefined) {
            return
        }

        // use dynamic import because geoip2-redist is an esm module
        this.geolite = await import('geolite2-redist')
        /*
        try {
            fs.accessSync(this.geoiIpDatabasePath, fs.constants.F_OK | fs.constants.W_OK)
        } catch (err) {
            if (err.code === 'ENOENT') {
                throw new Error('geoiIpDatabasePath directory does not exist')
            } else {
                throw new Error('geoiIpDatabasePath directory is not writable')
            }
        }
        */

        await this.checkDatabase()
        
        this.dbCheckInterval = LongTimeout.setInterval(async () => {
            try {
                await this.checkDatabase()
            } catch (e) {
                logger.warn('GeoIpLocator: monthly GeoIP database check failed', { error: e })
            }
        }, this.dbCheckIntervalLength)
    }

    stop(): void {
        if (this.dbCheckInterval !== undefined) {
            LongTimeout.clearInterval(this.dbCheckInterval)
        }
    }

    lookup(ip: string): GeoIpLookupResult | undefined {
        if (this.reader === undefined) {
            logger.warn('GeoIpLocator: lookup called before database is ready (maybe start() was not called?')
            return undefined
        }

        // If ip is undefined of null, the library will crash
        // this might happen despite the ts typings because the ip address 
        // comes from the ws server socket and is not under our control

        if (!(ip as unknown)) {
            return undefined
        }

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
