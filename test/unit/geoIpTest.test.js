const { getGeoIp } = require('../../src/helpers/GeoIpLookup')

describe('geoip lookup', () => {
    const ip1 = '1.1.1.1'
    const ip2 = '95.1.1.1'
    const localIp = '127.0.0.1'
    const invalidIp = '00000'

    it('valid ips return location results', () => {
        expect(getGeoIp(ip1)).toBeTruthy()
        expect(getGeoIp(ip2)).toBeTruthy()
    })

    it('local ips return null', () => {
        expect(getGeoIp(localIp)).toBeNull()
    })

    it('invalid ips return null', () => {
        expect(getGeoIp(invalidIp)).toBeNull()
    })
})
