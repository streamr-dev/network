import { Logger, withTimeout } from '@streamr/utils'

const logger = new Logger(module)

const fetchHeader: (url: string, header: string, timeout: number) => Promise<string | null> = async (
    url: string,
    header: string,
    timeout: number
) => {
    const response = await withTimeout(
        fetch(url, {
            method: 'HEAD'
        }),
        timeout
    )
    return response.headers.get(header)
}

export const fetchAirportCodeFromAmazon: (url: string, timeout: number) => Promise<string> = async (
    url: string,
    timeout: number
) => {
    const header = await fetchHeader(url, 'X-Amz-Cf-Pop', timeout)
    // parse airport code from the first 3 characters of X-Amz-Cf-Pop header
    if (!header || header.length < 3) {
        throw new Error('Could not get airport code from Amazon')
    }
    const airportCode = header.substring(0, 3)
    return airportCode
}

export const fetchAirportCodeFromFastly: (timeout: number) => Promise<string> = async (timeout: number) => {
    const header = await fetchHeader('https://www.fastly.com', 'X-Served-By', timeout)
    // parse airport code from the last 3 characters of X-Served-By header
    if (!header || header.length < 3) {
        throw new Error('Could not get airport code from Fastly')
    }
    const airportCode = header.substring(header.length - 3)
    return airportCode
}

export const fetchAirportCodeFromCloudflare: (timeout: number) => Promise<string> = async (timeout: number) => {
    const header = await fetchHeader('https://www.cloudflare.com', 'CF-RAY', timeout)
    // parse airport code from the last 3 characters of CF-RAY header
    if (!header || header.length < 3) {
        throw new Error('Could not get airport code from Cloudflare')
    }
    const airportCode = header.substring(header.length - 3)
    return airportCode
}

export const fetchAirportCodeFromCdn: () => Promise<string> = async () => {
    const timeout = 2000

    // try to get airport code from the first CDN that responds
    // if one fails, try the next one

    try {
        return await fetchAirportCodeFromAmazon('https://d47ahk2wrqweh.cloudfront.net/cdn-location', timeout)
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

    throw new Error('Could not get airport code from any CDN')
}
