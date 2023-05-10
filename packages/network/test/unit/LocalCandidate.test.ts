import { CandidateType, ParsedLocalCandidate } from "../../src/connection/webrtc/ParsedLocalCandidate"

describe('ParsedLocalCandidate', () => {
    const hostCandidate = 'a=candidate:1 1 UDP 132 127.0.0.1 55193 typ host'
    const nonHostCandidate = 'a=candidate:2 1 UDP 142 192.168.10.1 15216 typ srflx'

    it('parses host candidate correctly', () => {
        const candidate = new ParsedLocalCandidate(hostCandidate)
        expect(candidate.getType()).toEqual(CandidateType.HOST)
    })

    it('parses non-host candidate correctly', () => {
        const candidate = new ParsedLocalCandidate(nonHostCandidate)
        expect(candidate.getType()).toEqual(CandidateType.SRFLX)
    })

    it('can inject external ip into host candidate', () => {
        const candidate = new ParsedLocalCandidate(hostCandidate)
        const externalIp = '192.168.10.2'
        candidate.setIp(externalIp)
        expect(candidate.toString()).toEqual(`a=candidate:1 1 UDP 132 ${externalIp} 55193 typ host`)
    })
})
