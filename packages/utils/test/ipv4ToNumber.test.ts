import { ipv4ToNumber, numberToIpv4 } from '../src/ipv4ToNumber'

describe('ipv4ToNumber', () => {
    it('happy path', () => {
        const stringValue = '192.168.1.1'
        const numberValue = 3232235777
        expect(ipv4ToNumber(stringValue)).toEqual(numberValue)
        expect(numberToIpv4(numberValue)).toEqual(stringValue)
    })
})
