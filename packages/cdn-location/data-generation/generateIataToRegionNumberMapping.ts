import fs from 'fs'

// load airportsWithCoodinates.csv
const airportsWithCoordinates = fs
    .readFileSync('./data-generation/intermediate-files/airportsWithCoordinates.csv')
    .toString()

// parse the airportsWithCoordinates.csv file into an array of tuples
const airportsWithCoordinatesLines = airportsWithCoordinates.split('\n')
let airportsWithCoordinatesTuples = new Array<
    [code: string, x: string, y: string, number: number | undefined, continent: string, country: string]
>()
for (const line of airportsWithCoordinatesLines) {
    if (line.length < 3) {
        continue
    }
    const parts = line.split(' ')
    airportsWithCoordinatesTuples.push([parts[0], parts[1], parts[2], undefined, parts[3], parts[4]])
}

// load the TSP solver solution from shortestpath.csv

const shortestPath = fs.readFileSync('./data-generation/tsp-output/shortestpath.csv').toString()

// parse the shortestpath.csv file into an array of integers

const shortestPathLines = shortestPath.split('\n')
const shortestPathInts = new Array<number>()

for (const line of shortestPathLines) {
    shortestPathInts.push(parseInt(line) - 1)
}

// add shortestPathInts to airportsWithCoordinatesTuples array

for (let i = 0; i < shortestPathInts.length; i++) {
    if (shortestPathInts[i] < airportsWithCoordinatesTuples.length) {
        airportsWithCoordinatesTuples[shortestPathInts[i]][3] = i
    } else {
        console.error('shortestPathInts[i] = ' + shortestPathInts[i] + ' is out of range')
    }
}

// sort airportsWithCoordinatesTuples array by TSP solution

airportsWithCoordinatesTuples.sort((a, b) => {
    return a[3]! - b[3]!
})

// Cluster the airports by country

// pick all countries from the airportsWithCoordinatesTuples array into a Set

const countries = new Set<string>()
for (const tuple of airportsWithCoordinatesTuples) {
    countries.add(tuple[5])
}

// go through countries Set

for (const country of countries) {
    const clusters: [beginIdex: number, endIndex: number][] = []

    // find all the indice of beginnings and ends of the country in the sorted array

    for (let j = 0; j < airportsWithCoordinatesTuples.length; j++) {
        let beginIndex = -1
        let endIndex = -1

        for (let i = j; i < airportsWithCoordinatesTuples.length; i++) {
            if (airportsWithCoordinatesTuples[i][5] === country) {
                beginIndex = i
                break
            }
        }

        if (beginIndex === -1) {
            break
        }

        for (let i = beginIndex; i < airportsWithCoordinatesTuples.length; i++) {
            if (airportsWithCoordinatesTuples[i][5] !== country) {
                endIndex = i
                break
            }
        }

        if (endIndex === -1) {
            endIndex = airportsWithCoordinatesTuples.length
        }

        clusters.push([beginIndex, endIndex])

        j = endIndex
    }

    // sort clusters by the number of airports in them

    clusters.sort((a, b) => {
        return b[1] - b[0] - (a[1] - a[0])
    })

    // copy all lines of the country from airportsWithCoordinatesTuples
    // into a new array in the order of clusters array

    const countryArray = new Array<
        [code: string, x: string, y: string, number: number | undefined, continent: string, country: string]
    >()
    for (const cluster of clusters) {
        for (let i = cluster[0]; i < cluster[1]; i++) {
            countryArray.push(airportsWithCoordinatesTuples[i])
        }
    }

    const newArray = new Array<
        [code: string, x: string, y: string, number: number | undefined, continent: string, country: string]
    >()

    // go through airpotCorrdinatesTuples, copying lines to newArray.
    // If the line to be copied is the beginning of the first cluster,
    // copy countryArray to newArray instead. Do not copy
    // any other lines that are in clusters into newArray

    for (let i = 0; i < airportsWithCoordinatesTuples.length; i++) {
        if (i === clusters[0][0]) {
            for (const line of countryArray) {
                newArray.push(line)
            }
            i = clusters[0][1]
        }
        for (let j = 1; j < clusters.length; j++) {
            if (i === clusters[j][0]) {
                i = clusters[j][1]
            }
        }
        if (i < airportsWithCoordinatesTuples.length) {
            newArray.push(airportsWithCoordinatesTuples[i])
        }
    }
    airportsWithCoordinatesTuples = newArray
}

// make JFK the first airport in the array

let jfkIndex = -1
for (let i = 0; i < airportsWithCoordinatesTuples.length; i++) {
    if (airportsWithCoordinatesTuples[i][0] === 'JFK') {
        jfkIndex = i
        break
    }
}

let counter = 1
for (let i = jfkIndex; i < airportsWithCoordinatesTuples.length; i++) {
    airportsWithCoordinatesTuples[i][3] = counter
    counter++
}

for (let i = 0; i < jfkIndex; i++) {
    airportsWithCoordinatesTuples[i][3] = counter
    counter++
}

airportsWithCoordinatesTuples.sort((a, b) => {
    return a[3]! - b[3]!
})

// multiply airportNumber fields by 100 to make some room for future additions

for (const airportLine of airportsWithCoordinatesTuples) {
    airportLine[3] = airportLine[3]! * 100
}

// write the sorted array to a new file in order to check whether the order makes sense

const file = fs.createWriteStream('./data-generation/intermediate-files/airportsWithShortestPath.csv')
for (const tuple of airportsWithCoordinatesTuples) {
    file.write(`${tuple[3]} ${tuple[0]} ${tuple[1]} ${tuple[2]} ${tuple[4]} ${tuple[5]}\n`)
}

// Create a Record<string, number> to map airport codes to their airportNmuber in the array

const airportCodeToIndex: Record<string, [regionNumber: number, latitude: string, longitude: string]> = {}
for (const airportLine of airportsWithCoordinatesTuples) {
    airportCodeToIndex[airportLine[0]] = [airportLine[3]!, airportLine[1], airportLine[2]]
}

// write the airportCodeToIndex to a generated typescript file
// at src/airportCodeToRegion.ts and data-generation/final-data/airportCodeToRegion.ts

const airportCodeToIndexFile = fs.createWriteStream('./src/airportCodeToRegion.ts')
const airportCodeToIndexFile2 = fs.createWriteStream('./data-generation/final-data/airportCodeToRegion.ts')

const airportCodeToIndexFileHeader =
    'export const airportCodeToRegion: Record<string, [regionNumber: number, latitude: number, longitude: number]> = {\n'
airportCodeToIndexFile.write(airportCodeToIndexFileHeader)
airportCodeToIndexFile2.write(airportCodeToIndexFileHeader)

for (const key in airportCodeToIndex) {
    const airportCodeToIndexLine = `    ${key}: [${airportCodeToIndex[key][0]}, ${airportCodeToIndex[key][1]}, ${airportCodeToIndex[key][2]}],\n`
    airportCodeToIndexFile.write(airportCodeToIndexLine)
    airportCodeToIndexFile2.write(airportCodeToIndexLine)
}

airportCodeToIndexFile.write('}\n')
airportCodeToIndexFile2.write('}\n')

airportCodeToIndexFile.end()
airportCodeToIndexFile2.end()
