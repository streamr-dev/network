const geoiplite = require('geoip-lite')

const getGeoIp = (ip) => {
    return geoiplite.lookup(ip)
}

module.exports = {
    getGeoIp
}
