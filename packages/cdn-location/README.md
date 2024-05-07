# CDN-location

CDN-location is a small package that provides a way to detect the very rough location of the computer running the code (in the order of the IATA code of the CDN server serving the computer). Location data of this accuracy is useful for example in building location-aware P2P networks where the location data can be used to optimize the network topology. 

The location is detected using IATA code returned in HTTP response headers of:

1. https://aws.amazon.com
2. https://www.fastly.com
3. https://www.cloudflare.com

The three services are queried in this order, and the first non-empty **IATA code** returned is used as the approximate location of the user.

CDN-location also provides a mapping from the IATA airport codes in use by Amazon, Fastly and Cloudflare to **a numeric region number**. The region numbers have been chosen according to a solution to the travelling salesman problem (TSP) of finding the shortest paths between the IATA airports, and by clustering the solution by country to ensure that aiports in a single country receive subsequent region numbers. These numeric region numbers can be used to ensure that users from nearby regions also are near to each other in the ID space of a P2P network.

# Getting started

## Installation

```bash
npm install @streamr/cdn-location
```

## Usage

```typescript
import { getLocalRegion, getLocalAirportCode } from '@streamr/cdn-location'

(async () => {
    
    // Returns the region number (ending with '00') of the detected 
    // local CDN point of presence.
    // If the the local aiport code cannot be fetched from 
    // the CDN services, returns a random region number ending 
    // with '99' that is within the range of the 
    // region numbers in the file airportCodeToRegion.ts.  
    
    const regionNumber: number = await getLocalRegion()
    
    // Returns the IATA code of the local CDN point of 
    // presence or undefined if the local aiport code 
    // cannot be fetched from the CDN services.

    const airportCode: string|undefined = await getLocalAirportCode()

})()
```

# Advanced topic: data generation

**The following information is meant for advanced users who wish to re-generate the data files used by the package. If you are not interested in re-generating the data files, you can skip this section.**

The data file [src/airportCodeToRegion.ts](./src/airportCodeToRegion.ts) contains a mapping between IATA airport codes and numeric region IDs. 
The region numbers are chosen according to a solution to the travelling salesman problem (TSP) of finding the shortest paths between the IATA airports and clustering the result by country. The file [src/airportCodeToRegion.ts](./src/airportCodeToRegion.ts) is generated using the data and code found in __data-generation folder__.

The data generation is done in three steps:

1. Run prepareForTSPSolver.sh
2. Run a TSP solver of your choice
3. Run generateDataFromTSPSolverResult.sh

You need to run the script prepareForTSPSolver.sh first, then run the TSP solver of your choice to generate a solution to the travelling salesman problem, and finally run the script generateDataFromTSPSolverResult.sh to generate the [src/iataToRegion.ts](./src/iataToRegion.ts) file.

**This package does not contain a TSP solver.** It is up to the user who wishes to re-generate the data files to choose a TSP solver of their liking. You can find hints on how to solve the TSP problem from https://observablehq.com/@mourner/world-airports-shortest-roundtrip-tsp.

## Prerequisites

- jq `brew install jq` or `sudo apt-get install jq`
- pup `brew install pup` or `sudo apt-get install pup`

## Running prepareForTSPSolver.sh

Running the script:

`npm run prepare-for-tsp-solver`

Description:

This script prepares the data for the TSP solver. It downloads the data of all the airports in the world from OurAirports, and extracts the IATA codes of the Amazon, Fastly and CloudFlare point of presence airports. The script then merges the IATA codes of the Amazon, Fastly and CloudFlare point of presence airports into a single file. The script enhances the data of the airports with coordinates, and continent and country codes. Finally, the script generates a file that contains just the index (starting with 1) and coordinates of the airports in the same order as in the airports file. This file is used as the input to the TSP solver of your choice.

Inputs:
- __metropolitancodes.csv__
        A mapping between metropolitan pseudo-airport codes and codes of actual airports. This file is needed because OurAirports data only contains data about actual airports.

Generated intermediate files:
- __intermediate-files/amazonairports.csv__
        This file contains the IATA codes of the Amazon point of presence airports.
        Extracted from https://www.cloudping.cloud/cloudfront-edge-locations.json
- __intermediate-files/fastlyairports.csv__
        This file contains the IATA codes of the Fastly point of presence airports.
        Extracted from https://www.fastly.com/documentation/guides/concepts/pop/
- __intermediate-files/cloudflareairports.csv__
        This file contains the IATA codes of the CloudFlare point of presence airports.
        Extracted from https://www.cloudflarestatus.com/
- __intermediate-files/cdnairports.csv__
        This file contains the merged IATA codes of the Amazon, Fastly and CloudFlare point of presence airports.
- __intermediate-files/airports.csv__
        This file contains the data of all the airports in the world. Downloaded from https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv
- __intermediate-files/airportsWithCoordinates.csv__
        This file contains the all the airports from cdnairports.csv enhanced with coordinates, and continent and country codes obtained from airports.csv.

Outputs:

- __tsp-input/coordinates.csv__
        This file contains just the index (starting with 1) and coordinates of the airports from the __intermediate-files/airportsWithCoordinates.csv__
        file in same order. __Use this file as the input to the TSP solver
        of your choice__
    
## Running generateDataFromTSPSolverResult.sh

Description:

This script takes the solution to the TSP problem from __tsp-output/shortestpath.csv__
and combines it with the data of the airports in __intermediate-files/airportsWithCoordinates.csv__. The script then clusters the solution by country and assigns a numeric region number to each airport. The script finally generates a typescript file that contains the mapping between IATA airport codes and numeric region numbers. The script also generates a human-readable rendering of the mapping between IATA airport codes and numeric region numbers that can be used for checking the feasibility of the generated mapping.

Running the script: 

`npm run generate-data-from-tsp-solution`

Inputs: 
- __intermediate-files/airportsWithCoordinates.csv__
- __tsp-output/shortestpath.csv__
        This file contains the shortest path between the airports in the coordinates.csv file (indexing starts with 1). You need to generate this file by running a TSP solver. 

Outputs:
- __final-data/airportCodeToRegion.ts__
        **This is the final output of the data generation.** The file contains the mapping between IATA airport codes and numeric region numbers. The region numbers are chosen according to a solution to the travelling salesman problem (TSP) of finding the shortest paths between the IATA airports and by clustering the solution by country. __This file is automatically copied to the src/ folder of the package by the script, and will overwrite any previous version of the file.__ 
- __intermediate-files/airportsWithShortestPath.csv__ 
        This is a human-readable rendering of the final-data/airportCodeToRegion.ts file that can be used for checkig the feasibility of the 
        generated final-data/airportCodeToRegion.ts data file. It contains the IATA code, the region number and the coordinates, continent and country code of the airports. 

