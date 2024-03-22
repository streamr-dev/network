import { GeoIpLocator } from '../../src/helpers/GeoIpLocator'
import nock from 'nock'
import fs from 'fs'
import { wait } from '@streamr/utils'
import { setFlagsFromString } from 'v8'
import { runInNewContext } from 'vm'
//const wtf = require('wtfnode')

setFlagsFromString('--expose_gc')
const gc = runInNewContext('gc')

describe('GeoIpLocator', () => {
    let dirCounter = 0
    const dbPath = '/tmp'

    const getDbDir = () => {
        dirCounter++
        return dbPath + '/geolite2-' + dirCounter
    }

    it('can locate an IP address', async () => {
        const dbDir = getDbDir()
        const locator = new GeoIpLocator(dbDir)
        await locator.start()

        // suomi.fi
        const location = locator.lookup('62.241.198.245')

        expect(location).toBeDefined()

        // Helsinki, Finland
        expect(location!.latitude).toBe(60.1797)
        expect(location!.longitude).toBe(24.9344)

        locator.stop()
        fs.unlinkSync(dbDir + '/GeoLite2-City.mmdb')
        fs.rmdirSync(dbDir)
    })

    it('returns undefined with invalid IP address', async () => {
        const dbDir = getDbDir()
        const locator = new GeoIpLocator(dbDir)
        await locator.start()
        
        expect(locator.lookup('invalid')).toBeUndefined()
        expect(locator.lookup('')).toBeUndefined()
        expect(locator.lookup(undefined as unknown as string)).toBeUndefined()
        expect(locator.lookup(null as unknown as string)).toBeUndefined()
        expect(locator.lookup('127.0.0.1')).toBeUndefined()

        locator.stop()
        fs.unlinkSync(dbDir + '/GeoLite2-City.mmdb')
        fs.rmdirSync(dbDir)
    })

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

    // The test works, but skip it because 'got' lib used by geolite2-redist 
    // hangs the test for a while after the test is done
    it('start throws if no network connectivity', async () => {
        const dbDir = getDbDir()
        
        nock.disableNetConnect()

        const locator = new GeoIpLocator(dbDir)
        
        await expect(locator.start()).rejects.toThrow()
        
        locator.stop()
        nock.enableNetConnect()
        //wtf.dump()
    })

    it('works also after monthly check', async () => {
        const dbDir = getDbDir()
        const locator = new GeoIpLocator(dbDir, 5000)
        await locator.start()

        await wait(7000)

        // suomi.fi
        const location = locator.lookup('62.241.198.245')
        expect(location).toBeDefined()

        // Helsinki, Finland
        expect(location!.latitude).toBe(60.1797)
        expect(location!.longitude).toBe(24.9344)

        locator.stop()
        fs.unlinkSync(dbDir + '/GeoLite2-City.mmdb')
        fs.rmdirSync(dbDir)
    }, 60000)
    
    it('works also after monthly check if db gets deleted before the check', async () => {
        const dbDir = getDbDir()
        const locator = new GeoIpLocator(dbDir, 5000)
        await locator.start()

        fs.unlinkSync(dbDir + '/GeoLite2-City.mmdb')

        await wait(10000)

        // suomi.fi
        const location = locator.lookup('62.241.198.245')
        expect(location).toBeDefined()

        // Helsinki, Finland
        expect(location!.latitude).toBe(60.1797)
        expect(location!.longitude).toBe(24.9344)

        locator.stop()
        fs.unlinkSync(dbDir + '/GeoLite2-City.mmdb')
        fs.rmdirSync(dbDir)
    }, 60000)
    
    it('does not crash if monthly database check fails', async () => {
        const dbDir = getDbDir()
        const locator = new GeoIpLocator(dbDir, 5000)
        await locator.start()

        nock.disableNetConnect()
        await wait(10000)
        nock.enableNetConnect()

        // suomi.fi
        const location = locator.lookup('62.241.198.245')
        expect(location).toBeDefined()

        // Helsinki, Finland
        expect(location!.latitude).toBe(60.1797)
        expect(location!.longitude).toBe(24.9344)

        locator.stop()
        fs.unlinkSync(dbDir + '/GeoLite2-City.mmdb')
        fs.rmdirSync(dbDir)
    }, 60000)

    it('does not leak memory in monthly database check', async () => {
        const dbDir = getDbDir()
        const locator = new GeoIpLocator(dbDir, 1000)
        await locator.start()
        gc()
        await wait(1000)
        const memoryUsage = process.memoryUsage()
        await wait(10000)
        gc()
        await wait(1000)
        const memoryUsage2 = process.memoryUsage()
        
        expect(memoryUsage2.heapUsed).toBeLessThanOrEqual(memoryUsage.heapUsed)

        locator.stop()
        fs.unlinkSync(dbDir + '/GeoLite2-City.mmdb')
        fs.rmdirSync(dbDir)
    }, 60000)
})
