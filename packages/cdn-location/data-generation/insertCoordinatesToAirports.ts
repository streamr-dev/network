// use fetch() to download
// https://github.com/ip2location/ip2location-iata-icao/blob/master/iata-icao.csv

import fs from 'fs'

// open the airports.csv file downloaded from OurAirports
const ourAirports = fs.readFileSync('./data-generation/intermediate-files/ourairports.csv').toString()

const airportCodeToCoordinates: Map<string, [x: string, y: string, continent: string, country: string]> = new Map()

// parse airports.csv
const lines = ourAirports.split('\n')

lines.slice(1).forEach((line) => {
    // replace all ',' within hyphens with a '.' to avoid splitting on them

    const valuesWithDots = line.replace(/"([^",]+),([^",]+)"/g, '"$1.$2"')
    const values = valuesWithDots.split(',')
    if (line.length > 13) {
        const airportCode = values[13].replace(/"/g, '')
        const latitude = values[4].replace(/"/g, '')
        const longitude = values[5].replace(/"/g, '')
        const continent = values[7].replace(/"/g, '')
        const country = values[8].replace(/"/g, '')
        airportCodeToCoordinates.set(airportCode, [latitude, longitude, continent, country])
    }
})

// read metropolitancodes.csv and add the data of the corresponding
// actual airport to the airportCodeToCoordinates map with
// the metropolitan code as key

const metropolitanCodes = fs.readFileSync('./data-generation/metropolitanCodes.csv').toString()
const metropolitanCodesLines = metropolitanCodes.split('\n')
metropolitanCodesLines.forEach((line) => {
    const values = line.split(' ')
    const metropolitanCode = values[0]
    const airportCode = values[1]
    airportCodeToCoordinates.set(metropolitanCode, airportCodeToCoordinates.get(airportCode)!)
})

// open file for writing the airport codes with coordinates, continent and country
const file = fs.createWriteStream('./data-generation/intermediate-files/airportsWithCoordinates.csv')

// open file for writing the coordinates only
const coordinatesFile = fs.createWriteStream('./data-generation/tsp-input/coordinates.csv')

// read and parse the airport codes of the CDN airports

const localAirports = fs.readFileSync('./data-generation/intermediate-files/cdnairports.csv').toString()
const localAirportsLines = localAirports.split('\n')
let count = 1
localAirportsLines.forEach((line) => {
    if (line.length < 3) {
        return
    }
    const coords = airportCodeToCoordinates.get(line)

    if (coords) {
        // write the airport code with coordinates, continent and country
        file.write(`${line} ${coords[0]} ${coords[1]} ${coords[2]} ${coords[3]}\n`)

        // write the index airport code, and coordinates only
        coordinatesFile.write(`${count} ${coords[0]} ${coords[1]}\n`)
        count++
    } else {
        console.error(`No coordinates found for ${line}`)
    }
})
file.end()
coordinatesFile.end()
