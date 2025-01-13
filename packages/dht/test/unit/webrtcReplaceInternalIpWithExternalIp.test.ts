import { replaceInternalIpWithExternalIp } from '../../src/connection/webrtc/WebrtcConnector'

describe('replaceIpIfCandidateTypeIsHost', () => {
    const hostCandidate = 'candidate:1 1 UDP 2013266431 127.0.0.1 30000 typ host'
    const srflxCandidate = 'candidate:1 1 UDP 2013266431 127.0.0.1 30000 typ srflx'

    it('replaces ip if candidate type is host', () => {
        const replaced = replaceInternalIpWithExternalIp(hostCandidate, '0.0.0.0')
        expect(replaced).toEqual('candidate:1 1 UDP 2013266431 0.0.0.0 30000 typ host')
    })

    it('does not replace candidate if type is not host', () => {
        const replaced = replaceInternalIpWithExternalIp(srflxCandidate, '0.0.0.0')
        expect(replaced).toEqual(srflxCandidate)
    })
})
