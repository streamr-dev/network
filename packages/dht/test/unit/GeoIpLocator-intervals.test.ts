import { GeoIpLocator } from '../../src/helpers/GeoIpLocator'
import { wait } from '@streamr/utils'
import fs from 'fs'

describe('GeoIpLocator', () => {
    let dirCounter = 0
    const dbPath = '/tmp'
    let dbDir: string | undefined
    let locator: GeoIpLocator | undefined

    const getDbDir = () => {
        dirCounter++
        return dbPath + '/geolite2-intervals' + dirCounter
    }

    afterEach(async () => {
        locator!.stop()
        fs.unlinkSync(dbDir + '/GeoLite2-City.mmdb')
        fs.rmSync(dbDir!, { recursive: true })
    })

    it('schedules a new check with a diffrent interval if monthly database check fails', async () => {
        dbDir = getDbDir()
        locator = new GeoIpLocator(dbDir, 3000, 1000)
        await locator.start()
        
        const fetchMock = jest
            .spyOn(globalThis, 'fetch')
            .mockImplementation(async () => { 
                throw new Error('API is down') 
            })
        
        await wait(3100)

        // normal check interval should have been run after 3000ms
        expect(fetchMock).toHaveBeenCalledTimes(1)

        await wait(1500)
        
        // failure interval should have been run after 1500ms from the failure
        expect(fetchMock).toHaveBeenCalledTimes(2)

        fetchMock.mockRestore()
        const fetchMock2 = jest
            .spyOn(globalThis, 'fetch')

        fs.unlinkSync(dbDir + '/GeoLite2-City.mmdb')
        await wait(2000)

        expect(fetchMock2).toHaveBeenCalledTimes(2)

        // suomi.fi
        const location = locator.lookup('62.241.198.245')
        expect(location).toBeDefined()

        // Helsinki, Finland
        expect(location!.latitude).toBe(60.1797)
        expect(location!.longitude).toBe(24.9344)
    }, 60000)
})
