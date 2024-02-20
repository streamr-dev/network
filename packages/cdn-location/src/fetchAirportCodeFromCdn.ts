import { Logger, withTimeout } from '@streamr/utils'

const logger = new Logger(module)

export const fetchAirportCodeFromAmazon: (timeout?: number) => Promise<string> =
    async (timeout = 5000) => {
        const response = await withTimeout(fetch('https://aws.amazon.com', {
            method: 'HEAD'
        }), timeout)

        // parse airport code from the first 3 characters of X-Amz-Cf-Pop header

        const headers = response.headers
        const pop = headers.get('X-Amz-Cf-Pop')
        if (!pop || pop.length < 3) {
            throw new Error('Could not get airport code from Amazon')
        }
        
        const airportCode = pop?.substring(0, 3)

        if (!airportCode) {
            throw new Error('Could not get airport code from Amazon')
        }

        return airportCode
    }

export const fetchAirportCodeFromFastly: (timeout?: number) => Promise<string> =
    async (timeout = 5000) => {
        const response = await withTimeout(fetch('https://www.fastly.com', {
            method: 'HEAD'
        }), timeout)

        // parse airport code from the last 3 characters of X-Served-By header

        const headers = response.headers
        const pop = headers.get('X-Served-By')
        
        if (!pop || pop.length < 3) {
            throw new Error('Could not get airport code from Fastly')
        }
        
        const airportCode = pop?.substring(pop.length - 3)

        if (!airportCode) {
            throw new Error('Could not get airport code from Fastly')
        }

        return airportCode
    }

export const fetchAirportCodeFromCloudflare: (timeout?: number) => Promise<string> =
    async (timeout = 5000) => {
        const response = await withTimeout(fetch('https://www.cloudflare.com', {
            method: 'HEAD'
        }), timeout)

        // parse airport code from the last 3 characters of CF-RAY header

        const headers = response.headers
        const pop = headers.get('CF-RAY')
        
        if (!pop || pop.length < 3) {
            throw new Error('Could not get airport code from Cloudflare')
        }
        
        const airportCode = pop?.substring(pop.length - 3)

        if (!airportCode) {
            throw new Error('Could not get airport code from Cloudflare')
        }

        return airportCode
    }

export const fetchAirportCodeFromCdn: () => Promise<string | undefined> = async () => {
    const timeout = 5000
    
    // try to get airport code from the first CDN that responds
    // if one fails, try the next one

    try {
        return await fetchAirportCodeFromAmazon(timeout)
    } catch (error) {
        logger.warn(error)
    }

    try {
        return await fetchAirportCodeFromFastly(timeout)
    } catch (error) {
        logger.warn(error)
    }

    try {
        return await fetchAirportCodeFromCloudflare(timeout)
    } catch (error) {
        logger.warn(error)
    }

    return undefined
}
