import { Logger, filePathToNodeFormat } from '@streamr/utils'
import { CityResponse, Reader } from 'mmdb-lib'
import LongTimeout from 'long-timeout'
import { downloadGeoIpDatabase } from './downloadGeoIpDatabase'

const logger = new Logger(module)

interface GeoIpLookupResult {
    latitude: number
    longitude: number
}

// 30 days in milliseconds
const DEFAULT_DB_CHECK_INTERVAL = 30 * 24 * 60 * 60 * 1000
// 24 hours in milliseconds
const DEFAULT_DB_CHECK_ERROR_INTERVAL = 24 * 60 * 60 * 1000

export class GeoIpLocator {
    private abortController: AbortController
    private readonly geoIpDatabaseFolder: string
    private readonly dbCheckInterval: number
    private readonly dbCheckErrorInterval: number
    private readonly mirrorUrl?: string
    private reader?: Reader<CityResponse>
    private dbCheckTimeout?: LongTimeout.Timeout

    constructor(
        geoIpDatabaseFolder: string,
        dbCheckInterval = DEFAULT_DB_CHECK_INTERVAL,
        dbCheckErrorInterval = DEFAULT_DB_CHECK_ERROR_INTERVAL,
        mirrorUrl?: string
    ) {
        this.abortController = new AbortController()
        this.dbCheckInterval = dbCheckInterval
        this.dbCheckErrorInterval = dbCheckErrorInterval
        if (!geoIpDatabaseFolder.endsWith('/')) {
            geoIpDatabaseFolder += '/'
        }
        this.geoIpDatabaseFolder = filePathToNodeFormat(geoIpDatabaseFolder)
        this.mirrorUrl = mirrorUrl
    }

    private checkDatabase: () => Promise<void> = async () => {
        if (this.reader === undefined) {
            // if we do not have a reader, create a new one in any case
            this.reader = await downloadGeoIpDatabase(
                this.geoIpDatabaseFolder,
                true,
                this.abortController.signal,
                this.mirrorUrl
            )
        } else {
            // if we already have a reader, create a new one only if db has changed
            const newReader = await downloadGeoIpDatabase(
                this.geoIpDatabaseFolder,
                false,
                this.abortController.signal,
                this.mirrorUrl
            )
            if (newReader !== undefined) {
                this.reader = newReader
            }
        }
    }

    private scheduleCheck: (timeout: number) => void = async (timeout: number) => {
        if (this.abortController.signal.aborted) {
            return
        }
        this.dbCheckTimeout = LongTimeout.setTimeout(async () => {
            try {
                await this.checkDatabase()
                this.scheduleCheck(this.dbCheckInterval)
            } catch (err) {
                logger.warn('GeoIpLocator: GeoIP database check failed', { err })
                this.scheduleCheck(this.dbCheckErrorInterval)
            }
        }, timeout)
    }

    async start(): Promise<void> {
        if (this.dbCheckTimeout !== undefined) {
            return
        }
        await this.checkDatabase()
        this.scheduleCheck(this.dbCheckInterval)
    }

    stop(): void {
        if (this.dbCheckTimeout !== undefined) {
            LongTimeout.clearTimeout(this.dbCheckTimeout)
        }
        this.abortController.abort()
    }

    lookup(ip: string): GeoIpLookupResult | undefined {
        if (this.reader === undefined) {
            logger.warn('GeoIpLocator: lookup called before database is ready (maybe start() was not called?')
            return undefined
        }

        // If ip is falsy, the library will crash
        // this might happen despite the ts typings because the ip address
        // comes from the ws server socket and is not under our control
        if (!ip) {
            return undefined
        }

        const result = this.reader.get(ip)
        if (!result?.location?.latitude || !result.location.longitude) {
            return undefined
        } else {
            return {
                latitude: result.location.latitude,
                longitude: result.location.longitude
            }
        }
    }
}
