import { GeoIpLocator } from '../../src/GeoIpLocator'
import { wait, until } from '@streamr/utils'
import fs from 'fs'
import { TestServer } from '../helpers/TestServer'

describe('GeoIpLocator', () => {
    const serverPort = 31991
    const mirrorUrl = 'http://127.0.0.1:' + serverPort + '/'

    const DB_FILENAME = 'GeoLite2-City.mmdb'
    let dirCounter = 0
    const dbPath = '/tmp'
    let dbDir: string
    let locator: GeoIpLocator
    let testServer: TestServer

    const getDbDir = () => {
        dirCounter++
        return dbPath + '/geolitelocator2-intervals' + dirCounter
    }

    beforeAll(async () => {
        testServer = new TestServer()
        await testServer.start(serverPort)
    }, 120000)

    afterEach(async () => {
        locator!.stop()
        testServer!.stop()
        fs.rmSync(dbDir!, { recursive: true })
    })

    it('schedules a new check with a diffrent interval if monthly database check fails', async () => {
        dbDir = getDbDir()

        try {
            fs.unlinkSync(dbDir + '/' + DB_FILENAME)
        } catch {
            // ignore
        }

        locator = new GeoIpLocator(dbDir, 3000, 1000, mirrorUrl)

        // start locator normally
        await locator.start()

        // delete the db
        try {
            fs.unlinkSync(dbDir + '/' + DB_FILENAME)
        } catch {
            // ignore
        }

        // mock fetch to fail
        const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
            throw new Error('API is down')
        })

        // wait for the first check to happen
        await wait(3500)

        // normal check interval should have been run
        // after 3000ms, this should have tried
        // downloading the hash, but failed

        expect(fetchMock).toHaveBeenCalledTimes(1)

        // wait for the failure interval to happen
        await wait(1200)

        // failure interval should have been run after 1500ms from the failure
        // it should have tried downloading the hash again and
        // failed

        expect(fetchMock).toHaveBeenCalledTimes(2)

        // restore fetch
        fetchMock.mockRestore()

        // mock fetch again to just count the calls
        const fetchMock2 = jest.spyOn(globalThis, 'fetch')

        // wait for failure interval to happen
        await wait(1200)

        // failure interval should have downloaded
        // both the hash and the db

        expect(fetchMock2).toHaveBeenCalledTimes(2)

        // expect the db to be there
        await until(() => fs.existsSync(dbDir + '/' + DB_FILENAME), 10000)

        // suomi.fi
        const location = locator.lookup('62.241.198.245')
        expect(location).toBeDefined()

        // Helsinki, Finland
        expect(location!.latitude).toBe(60.1797)
        expect(location!.longitude).toBe(24.9344)
    }, 60000)
})
