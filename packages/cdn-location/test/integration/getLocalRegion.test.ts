import { getLocalAirportCodeByCoordinates, getLocalRegion, getLocalRegionByCoordinates } from '../../src/getLocalRegion'

describe('getLocalRegion', () => {
    it('returns the correct region', async () => {
        const region = await getLocalRegion()
        expect(typeof region).toBe('number')
    })

    it('returns a random region if requests fail', async () => {
        // replace fetch with a function that always times out

        global.fetch = jest.fn(() => {
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            return Promise.reject('API is down')
        })

        const region = await getLocalRegion()
        const regionString = region.toString()
        const lastTwoDigits = regionString.substring(regionString.length - 2)

        expect(typeof region).toBe('number')
        expect(lastTwoDigits).toEqual('99')
    }, 30000)

    it('returns a random region if requests timeout', async () => {
        // replace fetch with a function that always times out

        global.fetch = jest.fn(() => {
            return new Promise((_resolve, _reject) => {})
        })

        const region = await getLocalRegion()
        const regionString = region.toString()
        const lastTwoDigits = regionString.substring(regionString.length - 2)

        expect(typeof region).toBe('number')
        expect(lastTwoDigits).toEqual('99')
    }, 30000)

    it('returns correct region by coordinates', () => {
        expect(getLocalRegionByCoordinates(60, 25)).toEqual(8500)
        expect(getLocalRegionByCoordinates(40.6413, -73.7781)).toEqual(100)
        expect(getLocalRegionByCoordinates(0, -78)).toEqual(27000)
        expect(getLocalRegionByCoordinates(-37, -175)).toEqual(25700)
        expect(getLocalRegionByCoordinates(-25, -57)).toEqual(27800)
    })

    it('returns correct airport code by coordinates', () => {
        expect(getLocalAirportCodeByCoordinates(60, 25)).toEqual('HEL')
        expect(getLocalAirportCodeByCoordinates(40.6413, -73.7781)).toEqual('JFK')
        expect(getLocalAirportCodeByCoordinates(0, -78)).toEqual('UIO')
        expect(getLocalAirportCodeByCoordinates(-37, -175)).toEqual('AKL')
        expect(getLocalAirportCodeByCoordinates(-25, -57)).toEqual('ASU')
    })
})
