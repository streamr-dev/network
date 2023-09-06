import { CandidateType, ParsedLocalCandidate } from "../../src/connection/WebRTC/ParsedLocalCandidate"

describe('ParsedLocalCandidate', () => {

    const candidate = 'candidate:1 1 UDP 2013266431 127.0.0.1 30000 typ host'

    it('parses candidate', () => {
        const parsed = new ParsedLocalCandidate(candidate)
        expect(parsed.getType()).toEqual(CandidateType.HOST)
        expect(parsed.toString()).toEqual(candidate)
    })

    it('sets ip', () => {
        const parsed = new ParsedLocalCandidate(candidate)
        parsed.setIp('0.0.0.0')
        expect(parsed.toString()).toEqual('candidate:1 1 UDP 2013266431 0.0.0.0 30000 typ host')
    })

})
