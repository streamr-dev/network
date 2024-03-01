import { Logger } from '@streamr/utils'
import { fetchAirportCodeFromAmazon, 
    fetchAirportCodeFromCdn, 
    fetchAirportCodeFromCloudflare, 
    fetchAirportCodeFromFastly } from '../../src/fetchAirportCodeFromCdn'
import { airportCodeToRegionNumber } from '../../src/airportCodeToRegionNumber'

const logger = new Logger(module)

describe('fetchAirportCodeFromCdn', () => {
    
    it('fetches airport code from Amazon', async () => {
        const airportCode = await fetchAirportCodeFromAmazon('https://aws.amazon.com', 5000)
        logger.info(`Airport code from Amazon: ${airportCode}`)
        expect(typeof airportCodeToRegionNumber[airportCode]).toBe('number')
    })

    it('fetches airport code from Fastly', async () => {
        const airportCode = await fetchAirportCodeFromFastly(5000)
        logger.info(`Airport code from Fastly: ${airportCode}`)
        expect(typeof airportCodeToRegionNumber[airportCode]).toBe('number')
    })

    it('fetches airport code from Cloudflare', async () => {
        const airportCode = await fetchAirportCodeFromCloudflare(5000)
        logger.info(`Airport code from Cloudflare: ${airportCode}`)
        expect(typeof airportCodeToRegionNumber[airportCode]).toBe('number')
    })

    it('fetches airport code using the external interface', async () => {
        const airportCode = await fetchAirportCodeFromCdn()
        logger.info(`Airport code from CDN: ${airportCode}`)
        expect(typeof airportCodeToRegionNumber[airportCode]).toBe('number')
    })
})
