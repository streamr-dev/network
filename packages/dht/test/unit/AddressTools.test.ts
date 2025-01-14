import { getAddressFromIceCandidate, isPrivateIPv4 } from '../../src/helpers/AddressTools'

describe('getAddressFromIceCandidate', () => {
    it('extract IPv4 address from ICE host candidate', () => {
        expect(getAddressFromIceCandidate('candidate:1 1 udp 2122262783 203.0.113.180 4444 typ host')).toEqual(
            '203.0.113.180'
        )
    })

    it('extract IPv4 address from ICE server reflexive candidate', () => {
        expect(
            getAddressFromIceCandidate(
                'candidate:1 1 udp 2122262783 198.51.100.130 4445 typ srflx raddr 0.0.0.0 rport 0'
            )
        ).toEqual('198.51.100.130')
    })

    it('extract IPv6 address from ICE candidate', () => {
        expect(
            getAddressFromIceCandidate('candidate:1 1 udp 3756231458 2001:db8::4125:918c:4402:cc54 6666 typ host')
        ).toEqual('2001:db8::4125:918c:4402:cc54')
    })

    it('fail on mDNS ICE candidate', () => {
        expect(
            getAddressFromIceCandidate(
                'candidate:1 1 udp 2122296321 9b36eaac-bb2e-49bb-bb78-21c41c499900.local 7000 typ host'
            )
        ).toBeUndefined()
    })
})

describe('isPrivateIPv4', () => {
    it('return true for range 10.0.0.0/8', () => {
        expect(isPrivateIPv4('10.11.12.13')).toBe(true)
    })

    it('return true for range 172.16.0.0/12', () => {
        expect(isPrivateIPv4('172.16.130.131')).toBe(true)
    })

    it('return true for range 192.168.0.0/16', () => {
        expect(isPrivateIPv4('192.168.1.1')).toBe(true)
    })

    it('return false for a public address', () => {
        expect(isPrivateIPv4('203.0.113.181')).toBe(false)
    })

    it('return true for localhost IP address', () => {
        expect(isPrivateIPv4('127.0.0.1')).toBe(true)
    })
})
