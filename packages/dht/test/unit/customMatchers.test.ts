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
})
