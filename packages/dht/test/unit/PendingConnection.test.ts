import { wait, waitForEvent3 } from '@streamr/utils'
import { PendingConnection } from '../../src/exports'
import { createMockPeerDescriptor } from '../utils/utils'
import { PendingConnectionEvents } from '../../src/connection/PendingConnection'
import { MockConnection } from '../utils/mock/MockConnection'

describe('PendingConnection', () => {
    let pendingConnection: PendingConnection

    beforeEach(() => {
        pendingConnection = new PendingConnection(createMockPeerDescriptor(), 500)
    })

    afterEach(() => {
        pendingConnection.close(false)
    })

    it('does not emit disconnected after replacedAsDuplicate', async () => {
        pendingConnection.once('disconnected', () => {
            throw new Error('disconnected')
        })
        pendingConnection.replaceAsDuplicate()
        pendingConnection.close(false)
        await wait(50)
    })

    it('emits disconnected after timed out', async () => {
        await waitForEvent3<PendingConnectionEvents>(pendingConnection, 'disconnected')
    })

    it('does not emit disconnected if destroyed', async () => {
        pendingConnection.once('disconnected', () => {
            throw new Error('disconnected')
        })
        pendingConnection.destroy()
        await wait(50)
    })

    it('emites connected', (done) => {
        const mockConnection = new MockConnection()
        pendingConnection.once('connected', (_peerDescriptor, connection) => {
            expect(mockConnection).toEqual(connection)
            done()
        })
        pendingConnection.onHandshakeCompleted(mockConnection)
    })

    it('does not emit connected if replaced', async () => {
        pendingConnection.once('connected', () => {
            throw new Error('connected')
        })
        pendingConnection.replaceAsDuplicate()
        await wait(50)
    })
})
