const geoiplite = require('geoip-lite')

const getLogger = require('../helpers/logger')

function getGeoIp(ip) {
    return geoiplite.lookup(ip)
}

function isValidNodeLocation(location) {
    return location && (location.country || location.city || location.latitude || location.longitude)
}

module.exports = class LocationManager {
    constructor() {
        this.nodeLocations = {} // nodeId => location
        this.logger = getLogger('streamr:logic:tracker:LocationManager')
    }

    getAllNodeLocations() {
        return this.nodeLocations
    }

    getNodeLocation(nodeId) {
        return this.nodeLocations[nodeId]
    }

    updateLocation({ nodeId, location, address }) {
        if (isValidNodeLocation(location)) {
            this.nodeLocations[nodeId] = location
        } else if (!isValidNodeLocation(this.nodeLocations[nodeId])) {
            let geoIpRecord
            if (address) {
                try {
                    const ip = address.split(':')[1].replace('//', '')
                    geoIpRecord = getGeoIp(ip)
                } catch (e) {
                    this.logger.error('Could not parse IP from address', nodeId, address)
                }
            }
            if (geoIpRecord) {
                this.nodeLocations[nodeId] = {
                    country: geoIpRecord.country,
                    city: geoIpRecord.city,
                    latitude: geoIpRecord.ll[0],
                    longitude: geoIpRecord.ll[1]
                }
            }
        }
    }

    removeNode(nodeId) {
        delete this.nodeLocations[nodeId]
    }
}
