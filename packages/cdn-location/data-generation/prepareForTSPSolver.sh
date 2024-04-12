#!/bin/bash

cd data-generation/intermediate-files &&

# Fetch and parse the IATA codes of CDN edge locations
curl -s https://www.cloudping.cloud/cloudfront-edge-locations.json | jq -r '.nodes | keys[]' > amazonairports.csv &&
curl -s https://www.fastly.com/documentation/guides/concepts/pop/#complete-list-of-pops | pup 'table:nth-of-type(1) tbody tr json{}' | jq -r '.[] | .children[1].children[0].text | select( . != null )' > fastlyairports.csv &&
curl -s https://www.cloudflarestatus.com/ | pup 'div[data-component-status] text{}' | grep -o '([A-Z]\{3\})' | sed 's/[()]//g' > cloudflareairports.csv &&

# Merge the IATA codes of all CDN edge locations
cat amazonairports.csv fastlyairports.csv cloudflareairports.csv | sort | uniq > cdnairports.csv &&

# Download the data of all airports in the world from OurAirports
curl https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv --output ourairports.csv &&

# Save coordinate, continent and country data for airports listed in cdnaiprorts.csv
# into airportsWithCoordinates.csv. Also add lines for metropolitan airport
# codes listed in metropolitancodes.csv. Save only the coordinates of the
# airports in same order into coordinates.csv (this file is to be used
# as input to the tsp solver).   

npx ts-node data-generation/insertCoordinatesToAirports.ts
