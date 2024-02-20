import { getLocalRegion } from '../../src/getLocalRegion'

describe('getLocalRegion', () => {
    it('returns the correct region', async () => {
        const region = await getLocalRegion()
        expect(typeof region).toBe('number')
    })

    it('returns a random region if fetch is mocked to reject', async () => {
        // replace fetch with a function that always times out

        global.fetch = jest.fn(() => {
            return Promise.reject('API is down')
        })

        const region = await getLocalRegion()
        const regionString = region.toString()
        const lastTwoDigits = regionString.substring(regionString.length - 2)
        
        expect(typeof region).toBe('number')
        expect(lastTwoDigits).toEqual('99')
    }, 30000)
})
