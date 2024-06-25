# geoip-location

@streamr/geoip-location is a package that provides a way to detect the latitude and longitude of an IP address using
the [mmdb-lib reader package](https://www.npmjs.com/package/mmdb-lib) and the MaxMind GeoLite2 City database resdistributed by [GitSquared/node-geolite2-redist](https://github.com/GitSquared/node-geolite2-redist). The library complies with the
[MaxMind GeoLite2 End User License Agreement] (https://www.maxmind.com/en/geolite2/eula) by keeping the database up-to-date by periodically downloading the fresh database from the GitSquared/node-geolite2-redist repository. 

## Differences to the node-geolite2-redist package

* The period between checks for the updates of the GeoLite2 City database is configurable
* Distributed as commonjs module for greater compatibility with other packages
* Better error handling and focus on clean shutdown without lingering timers or memory leaks
* Fewer dependencies: uses 'fetch' instead of 'got' for downloading the database
* Only supports the GeoLite2 City database
* Only returns the latitude and longitude of the IP address

# Getting started

## Installation

```bash
npm install @streamr/geoip-location
```

## Usage

```typescript
import { GeoIpLocator } from '@streamr/geoip-location'

(async () => {
    
        // Creates a new GeoIpLocator object with the following parameters:
        // geoiIpDatabasePath: string - the path to the directory for the GeoLite2 City database
        // the disrectory will be created if it does not exist. 
        // dbCheckInterval?: number - the interval in milliseconds between the checks 
        // for the updates of the GeoLite2 City database (default: 28 days)
        // dbCheckErrorInterval?: number - the interval in milliseconds between the checks 
        // for the updates of the GeoLite2 City database in case of a failed update (default: 1 day)
         
        const locator = new GeoIpLocator('~/geoipdatabases', 15 * 24 * 60 * 60 * 1000, 60 * 60 * 1000)
        
        // Downloads the GeoLite2 City database if it is not found in the geoiIpDatabasePath 
        // or if the database is outdated. Also starts the db update timer. 

        await locator.start()
  
        // Returns the { latitude, longitude } of the IP address 
        // or undefined if the location cannot be found
        
        const location = locator!.lookup('62.241.198.245')
        
        console.log(location.latitude)         // 60.1695
        console.log(location.longitude)        // 24.9354
        
        // Stops the db update timer, does not delete the GeoLite2 City database

        locator.stop()

        // (optional) Deletes the GeoLite2 City database
       
        fs.unlinkSync(dbDir + '~/geoipdatabases/GeoLite2-City.mmdb')

})()
```

## License

This package is licensed under the Apache-2.0 license (see [LICENSE](./LICENSE)).
The databases themselves are provided by MaxMind under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) and redistributed by [GitSquared/node-geolite2-redist](https://github.com/GitSquared/node-geolite2-redist)


**This software package uses GeoLite2 data created by MaxMind, available from [https://www.maxmind.com](https://www.maxmind.com).**

