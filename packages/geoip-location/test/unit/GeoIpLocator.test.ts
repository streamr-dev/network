import { GeoIpLocator } from '../../src/GeoIpLocator'
import fs from 'fs'
import { wait } from '@streamr/utils'
import { TestServer } from '../helpers/TestServer'

describe('GeoIpLocator', () => {
    let testServer: TestServer
    let dirCounter = 0
    const dbPath = '/tmp'
    const serverPort = 31992
    const serverUrl = 'http://127.0.0.1:' + serverPort + '/'

    const getDbDir = () => {
        dirCounter++
        return dbPath + '/geolite2-' + dirCounter
    }

    beforeAll(async () => {
        testServer = new TestServer()
        await testServer.start(serverPort)
    }, 120000)

    afterAll(async () => {
        testServer!.stop()
    })

    describe('tests with normal startup and shutdown', () => {
        let dbDir: string
        let locator: GeoIpLocator

        it('can locate an IP address', async () => {
            dbDir = getDbDir()
            locator = new GeoIpLocator(dbDir, 5000, 5000, serverUrl)
            await locator.start()

            // suomi.fi
            const location = locator.lookup('62.241.198.245')

            expect(location).toBeDefined()

            // Helsinki, Finland
            expect(location!.latitude).toBe(60.1797)
            expect(location!.longitude).toBe(24.9344)

            locator.stop()
            fs.unlinkSync(dbDir + '/GeoLite2-City.mmdb')
            fs.rmSync(dbDir, { recursive: true })
        })

        it('returns undefined with invalid IP address', async () => {
            dbDir = getDbDir()
            locator = new GeoIpLocator(dbDir, 5000, 5000, serverUrl)
            await locator.start()

            expect(locator.lookup('invalid')).toBeUndefined()
            expect(locator.lookup('')).toBeUndefined()
            expect(locator.lookup(undefined as unknown as string)).toBeUndefined()
            expect(locator.lookup(null as unknown as string)).toBeUndefined()
            expect(locator.lookup('127.0.0.1')).toBeUndefined()

            locator.stop()
            fs.unlinkSync(dbDir + '/GeoLite2-City.mmdb')
            fs.rmSync(dbDir, { recursive: true })
        })

        it('works also after monthly check', async () => {
            dbDir = getDbDir()
            locator = new GeoIpLocator(dbDir, 5000, 5000, serverUrl)
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
            fs.rmSync(dbDir, { recursive: true })
        }, 60000)

        it('works also after monthly check if db gets deleted before the check', async () => {
            dbDir = getDbDir()
            locator = new GeoIpLocator(dbDir, 5000, 5000, serverUrl)
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
            fs.rmSync(dbDir, { recursive: true })
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
})
