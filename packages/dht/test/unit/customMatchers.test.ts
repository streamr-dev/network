import { cloneDeep } from 'lodash'
import { createMockPeerDescriptor } from '../utils/utils'

describe('custom matchers', () => {
    it('happy path', () => {
        const peerDescriptor = createMockPeerDescriptor({
            websocket: { port: 1, host: 'x', tls: true }
        })
        expect(peerDescriptor).toEqualPeerDescriptor(cloneDeep(peerDescriptor))
    })

    it('no match', () => {
        expect(createMockPeerDescriptor()).not.toEqualPeerDescriptor(createMockPeerDescriptor())
    })

    describe('error message', () => {
        it('normal', () => {
            const actual = createMockPeerDescriptor()
            const expected = createMockPeerDescriptor()
            expect(() => {
                expect(actual).toEqualPeerDescriptor(expected)
            }).toThrow("PeerDescriptor nodeId values don't match")
        })

        it('inverse', () => {
            const peerDescriptor = createMockPeerDescriptor()
            expect(() => {
                expect(peerDescriptor).not.toEqualPeerDescriptor(peerDescriptor)
            }).toThrow('PeerDescriptors are equal')
        })
    })
})
