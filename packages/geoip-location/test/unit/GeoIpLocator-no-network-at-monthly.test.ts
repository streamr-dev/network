import { GeoIpLocator } from '../../src/GeoIpLocator'
import fs from 'fs'
import { wait } from '@streamr/utils'
import { TestServer } from '../helpers/TestServer'

describe('GeoIpLocatorNoNetworkAtMonthly', () => {
    let dirCounter = 0
    const dbPath = '/tmp'
    const serverPort = 31990
    const serverUrl = 'http://localhost:' + serverPort + '/'

    let testServer: TestServer
    let dbDir: string
    let locator: GeoIpLocator

    const getDbDir = () => {
        dirCounter++
        return dbPath + '/geolite2-no-nw-monthly' + dirCounter
    }

    beforeAll(async () => {
        testServer = new TestServer()
        await testServer.start(serverPort)
        dbDir = getDbDir()
        locator = new GeoIpLocator(dbDir, 5000, 10000, serverUrl)
        await locator.start()
    }, 120000)

    afterAll(async () => {
        locator!.stop()
        testServer!.stop()
        fs.unlinkSync(dbDir + '/GeoLite2-City.mmdb')
        fs.rmSync(dbDir!, { recursive: true })
    })

    it('does not crash if monthly database check fails because of fetch returning garbage', async () => {
        const oldFetch = globalThis.fetch
        const fetchMock = jest
            .spyOn(globalThis, 'fetch')
            .mockImplementation(() => oldFetch('https://streamr.network'))

        await wait(10000)

        fetchMock.mockRestore()

        // helsinki.fi
        const location = locator!.lookup('128.214.222.50')
        expect(location).toBeDefined()

        // Helsinki, Finland
        expect(location!.latitude).toBeCloseTo(60.1719, 1)
        expect(location!.longitude).toBeCloseTo(24.9347, 1)

    }, 60000)
})
