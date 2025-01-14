import { waitForEvent3 } from '@streamr/utils'
import { NodeWebrtcConnection } from '../../src/connection/webrtc/NodeWebrtcConnection'
import { createMockPeerDescriptor } from '../utils/utils'
import { ConnectionEvents } from '../../src/connection/IConnection'

describe('WebrtcConnection', () => {
    let connection: NodeWebrtcConnection

    beforeEach(() => {
        const peerDescriptor = createMockPeerDescriptor()
        connection = new NodeWebrtcConnection({
            remotePeerDescriptor: peerDescriptor
        })
    })

    afterEach(() => {
        connection.close(true)
    })

    it('Disconnects early if remote descriptor is not set', async () => {
        connection.start(true)
        await waitForEvent3<ConnectionEvents>(
            connection as any,
            'disconnected',
            5001,
            (_graceful: boolean, _code: number, reason: string) => {
                expect(reason).toBe('timed out due to remote descriptor not being set')
                return true
            }
        )
    })
})
