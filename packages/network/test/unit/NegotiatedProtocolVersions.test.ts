import { NegotiatedProtocolVersions } from '../../src/connection/NegotiatedProtocolVersions'
import { PeerInfo } from '../../src/connection/PeerInfo'

describe('NegotiatedProtocolVersions', () => {
    let negotiatedProtocolVersions: NegotiatedProtocolVersions

    beforeEach(() => {
        const peerInfo = PeerInfo.newNode('node', null, [1,2], [30,31,32])
        negotiatedProtocolVersions = new NegotiatedProtocolVersions(peerInfo)
        negotiatedProtocolVersions.negotiateProtocolVersion('peer2', [1,2,3,4,5], [29,30,31,32,33])
        negotiatedProtocolVersions.negotiateProtocolVersion('peer3', [1,5], [29,31])
    })

    it('negotiates versions as expected', () => {
        expect(negotiatedProtocolVersions.getNegotiatedProtocolVersions('peer2')).toEqual({
            controlLayerVersion: 2,
            messageLayerVersion: 32
        })
        expect(negotiatedProtocolVersions.getNegotiatedProtocolVersions('peer3')).toEqual({
            controlLayerVersion: 1,
            messageLayerVersion: 31
        })
    })

    it('error is thrown if version negotiation is unsuccessful', () => {
        expect(() => negotiatedProtocolVersions.negotiateProtocolVersion(
            'faulty',
            [8,9],
            [33])
        ).toThrow('Supported ControlLayer versions: [1,2]. Are you using an outdated library?')
    })

    it('non-existent peerId get request returns undefined', () => {
        expect(negotiatedProtocolVersions.getNegotiatedProtocolVersions('peer5')).toEqual(undefined)
    })

    it('negotiated versions are removed successfully', () => {
        negotiatedProtocolVersions.removeNegotiatedProtocolVersion('peer2')
        expect(negotiatedProtocolVersions.getNegotiatedProtocolVersions('peer2')).toEqual(undefined)
    })
})
