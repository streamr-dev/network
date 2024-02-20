import { airportCodeToRegionNumber } from './airportCodeToRegionNumber'
import { fetchAirportCodeFromCdn } from './fetchAirportCodeFromCdn'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

export const getLocalAirportCode: () => Promise<string | undefined> = async () => {
    return fetchAirportCodeFromCdn()
}

const getRandomRegion: () => number = () => {
    // randomize the region form airpotCodeToRegionNumber

    const airportCodes = Object.keys(airportCodeToRegionNumber)
    const randomAirportCode = airportCodes[Math.floor(Math.random() * airportCodes.length)]

    // indicate that the region is random by adding 99, the convention is
    // that random region numbers end with 99

    const randomRegion = airportCodeToRegionNumber[randomAirportCode] + 99
    
    logger.warn(`Could not get airport code, using random region: ${randomRegion}`)
    return randomRegion
}

export const getLocalRegion: () => Promise<number> = async () => {
    const airportCode = await getLocalAirportCode()
    if (airportCode === undefined) {
        return getRandomRegion()
    }

    if (!airportCodeToRegionNumber[airportCode]) {
        return getRandomRegion()
    }

    return airportCodeToRegionNumber[airportCode]
}
