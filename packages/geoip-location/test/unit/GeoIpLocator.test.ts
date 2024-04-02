import { GeoIpLocator } from '../../src/GeoIpLocator'
import fs from 'fs'
import { wait } from '@streamr/utils'
import { setFlagsFromString } from 'v8'
import { runInNewContext } from 'vm'

setFlagsFromString('--expose_gc')
const gc = runInNewContext('gc')

describe('GeoIpLocator', () => {
    let dirCounter = 0
    const dbPath = '/tmp'

    const getDbDir = () => {
        dirCounter++
        return dbPath + '/geolite2-' + dirCounter
    }

    describe('tests with normal startup and shutdown', () => {
        let dbDir: string | undefined
        let locator: GeoIpLocator | undefined

        beforeEach(async () => {
            dbDir = getDbDir()
            locator = new GeoIpLocator(dbDir, 5000)
            await locator.start()
        })

        afterEach(async () => {
            locator!.stop()
            fs.unlinkSync(dbDir + '/GeoLite2-City.mmdb')
            fs.rmSync(dbDir!, { recursive: true })
        })

        it('can locate an IP address', async () => {
            // suomi.fi
            const location = locator!.lookup('62.241.198.245')
    
            expect(location).toBeDefined()
    
            // Helsinki, Finland
            expect(location!.latitude).toBe(60.1797)
            expect(location!.longitude).toBe(24.9344)
        })
    
        it('returns undefined with invalid IP address', async () => {
            expect(locator!.lookup('invalid')).toBeUndefined()
            expect(locator!.lookup('')).toBeUndefined()
            expect(locator!.lookup(undefined as unknown as string)).toBeUndefined()
            expect(locator!.lookup(null as unknown as string)).toBeUndefined()
            expect(locator!.lookup('127.0.0.1')).toBeUndefined()
        })

        it('works also after monthly check', async () => {
            await wait(7000)
    
            // suomi.fi
            const location = locator!.lookup('62.241.198.245')
            expect(location).toBeDefined()
    
            // Helsinki, Finland
            expect(location!.latitude).toBe(60.1797)
            expect(location!.longitude).toBe(24.9344)
    
        }, 60000)

        it('works also after monthly check if db gets deleted before the check', async () => {
            fs.unlinkSync(dbDir + '/GeoLite2-City.mmdb')
    
            await wait(10000)
    
            // suomi.fi
            const location = locator!.lookup('62.241.198.245')
            expect(location).toBeDefined()
    
            // Helsinki, Finland
            expect(location!.latitude).toBe(60.1797)
            expect(location!.longitude).toBe(24.9344)
    
        }, 60000)
    })

    describe('tests with failing startup', () => {
        it('returns undefined if not started', async () => {
            const dbDir = getDbDir()
            const locator = new GeoIpLocator(dbDir)
            const location = locator.lookup('62.241.198.245')
            expect(location).toBeUndefined()
        })

        it('start() throws if database path does not exist', async () => {
            const locator = new GeoIpLocator('/nonexistent')
            await expect(locator.start()).rejects.toThrow()
        })
    
        it('start() throws if database path is not writable', async () => {
            const locator = new GeoIpLocator('/etc')
            await expect(locator.start()).rejects.toThrow()
        })
    })

    describe('tests with non-standard startup', () => { 
        let dbDir: string | undefined
        let locator: GeoIpLocator | undefined

        afterEach(async () => {
            locator!.stop()
            fs.unlinkSync(dbDir + '/GeoLite2-City.mmdb')
            fs.rmSync(dbDir!, { recursive: true })
        })

        it('does not leak memory in monthly database check', async () => {
            dbDir = getDbDir()
            locator = new GeoIpLocator(dbDir, 1000)
            await locator.start()
            gc()
            await wait(2000)
            const memoryUsage = process.memoryUsage()
            await wait(10000)
            await locator.stop()
            gc()
            await wait(2000)
            const memoryUsage2 = process.memoryUsage()
            expect(memoryUsage2.heapUsed).toBeLessThanOrEqual(memoryUsage.heapUsed)
        }, 60000)
    })
})
