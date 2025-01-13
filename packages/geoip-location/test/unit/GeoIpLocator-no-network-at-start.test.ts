import { GeoIpLocator } from '../../src/GeoIpLocator'

describe('GeoIpLocator', () => {
    let dirCounter = 0
    const dbPath = '/tmp'

    const getDbDir = () => {
        dirCounter++
        return dbPath + '/geolite2-no-nw-start' + dirCounter
    }

    it('start throws if no network connectivity', async () => {
        const dbDir = getDbDir()

        const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
            throw new Error('API is down')
        })

        const locator = new GeoIpLocator(dbDir)

        await expect(locator.start()).rejects.toThrow()

        fetchMock.mockRestore()

        locator.stop()
    })
})
