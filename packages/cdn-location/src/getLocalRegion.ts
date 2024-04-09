import { airportCodeToRegion } from './airportCodeToRegion'
import { fetchAirportCodeFromCdn } from './fetchAirportCodeFromCdn'
import { Logger } from '@streamr/utils'
import haversine from 'haversine'

const logger = new Logger(module)

let cachedLocalRegion: number | undefined = undefined
let cachedLocalRegionFetchTime: number | undefined = undefined

export const getLocalAirportCode: () => Promise<string | undefined> = async () => {
    let airportCode: string
    try {
        airportCode = await fetchAirportCodeFromCdn()
    } catch (error) {
        return undefined
    }
    return airportCode
}

export const getLocalAirportCodeByCoordinates: (latitude: number, longitude: number) => string = (latitude, longitude) => {
    const distances: Array<[airportCode: string, distance: number]> = []

    Object.keys(airportCodeToRegion).forEach((key) => {
        const airport = airportCodeToRegion[key]
        const distance = haversine({ latitude, longitude }, { latitude: airport[1], longitude: airport[2] })
        distances.push([key, distance])
    })

    // find the closest region
    distances.sort((a, b) => a[1] - b[1])

    return distances[0][0]
}

const getRandomRegion: () => number = () => {
    // randomize the region form airpotCodeToRegionNumber

    const airportCodes = Object.keys(airportCodeToRegion)
    const randomAirportCode = airportCodes[Math.floor(Math.random() * airportCodes.length)]

    // indicate that the region is random by adding 99, the convention is
    // that random region numbers end with 99

    const randomRegion = airportCodeToRegion[randomAirportCode][0] + 99

    logger.warn(`Could not get airport code, using random region: ${randomRegion}`)
    return randomRegion
}

export const getLocalRegionWithCache: (maxCacheAge: number) => Promise<number> =
    async (maxCacheAge: number) => {
        if (cachedLocalRegion === undefined || cachedLocalRegionFetchTime === undefined ||
            Date.now() - cachedLocalRegionFetchTime > maxCacheAge) {

            return getLocalRegion()
        }

        return cachedLocalRegion
    }

export const getLocalRegion: () => Promise<number> = async () => {
    let airportCode: string | undefined = undefined

    airportCode = await getLocalAirportCode()

    if (airportCode === undefined || !airportCodeToRegion[airportCode]) {
        return getRandomRegion()
    }

    cachedLocalRegion = airportCodeToRegion[airportCode][0]
    cachedLocalRegionFetchTime = Date.now()

    return airportCodeToRegion[airportCode][0]
}

export const getLocalRegionByCoordinates: (latitude: number, longitude: number) => number = (latitude, longitude) => {
    const distances: Array<[regionNumber: number, distance: number]> = []

    Object.keys(airportCodeToRegion).forEach((key) => {
        const airport = airportCodeToRegion[key]
        const distance = haversine({ latitude, longitude }, { latitude: airport[1], longitude: airport[2] })
        distances.push([airport[0], distance])
    })

    // find the closest region
    distances.sort((a, b) => a[1] - b[1])

    return distances[0][0]
}
