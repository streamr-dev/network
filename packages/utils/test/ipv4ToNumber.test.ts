import { ipv4ToNumber } from '../src/ipv4ToNumber'

describe('ipv4ToNumber', () => {
    it('converts a valid IPv4 address to a number', () => {
        const ip = '192.168.1.1'
        const expected = 3232235777
        const result = ipv4ToNumber(ip)
        expect(result).toEqual(expected)
    })
})
