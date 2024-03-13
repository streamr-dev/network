import { airportCodeToRegionNumber } from './airportCodeToRegionNumber'
import { fetchAirportCodeFromCdn } from './fetchAirportCodeFromCdn'
import { Logger } from '@streamr/utils'
import haversine from 'haversine' 

const logger = new Logger(module)

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

    Object.keys(airportCodeToRegionNumber).forEach((key) => {
        const airport = airportCodeToRegionNumber[key]
        const distance = haversine({ latitude, longitude }, { latitude: airport[1], longitude: airport[2] })
        distances.push([key, distance])
    })

    // find the closest region
    distances.sort((a, b) => a[1] - b[1])

    return distances[0][0]
}

const getRandomRegion: () => number = () => {
    // randomize the region form airpotCodeToRegionNumber

    const airportCodes = Object.keys(airportCodeToRegionNumber)
    const randomAirportCode = airportCodes[Math.floor(Math.random() * airportCodes.length)]

    // indicate that the region is random by adding 99, the convention is
    // that random region numbers end with 99

    const randomRegion = airportCodeToRegionNumber[randomAirportCode][0] + 99

    logger.warn(`Could not get airport code, using random region: ${randomRegion}`)
    return randomRegion
}

export const getLocalRegion: () => Promise<number> = async () => {
    let airportCode: string | undefined = undefined
    
    airportCode = await getLocalAirportCode()
   
    if (airportCode === undefined || !airportCodeToRegionNumber[airportCode]) {
        return getRandomRegion()
    }

    return airportCodeToRegionNumber[airportCode][0]
}

export const getLocalRegionByCoordinates: (latitude: number, longitude: number) => number = (latitude, longitude) => {    
    const distances: Array<[regionNumber: number, distance: number]> = []

    Object.keys(airportCodeToRegionNumber).forEach((key) => {
        const airport = airportCodeToRegionNumber[key]
        const distance = haversine({ latitude, longitude }, { latitude: airport[1], longitude: airport[2] })
        distances.push([airport[0], distance])
    })

    // find the closest region
    distances.sort((a, b) => a[1] - b[1])

    return distances[0][0]
}
