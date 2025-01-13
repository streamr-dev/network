import { MetricsContext } from '@streamr/utils'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { toNodeId, PendingConnection } from '../../src/exports'
import { FakeConnectorFacade } from '../utils/FakeConnectorFacade'
import { MockConnection } from '../utils/mock/MockConnection'
import { createMockPeerDescriptor } from '../utils/utils'
import { getOfferer } from '../../src/helpers/offering'

describe('ConnetionManager', () => {
    let connectionManager: ConnectionManager
    let fakeConnectorFacade: FakeConnectorFacade
    const localPeerDescriptor = createMockPeerDescriptor()

    beforeEach(async () => {
        connectionManager = new ConnectionManager({
            metricsContext: new MetricsContext(),
            allowIncomingPrivateConnections: false,
            createConnectorFacade: () => {
                fakeConnectorFacade = new FakeConnectorFacade(localPeerDescriptor)
                return fakeConnectorFacade
            }
        })
        await connectionManager.start()
    })

    afterEach(async () => {
        await connectionManager.stop()
    })

    it('should replace a duplicate connecting connection', () => {
        const remotePeerDescriptor = createMockPeerDescriptor()
        const pendingConnection1 = new PendingConnection(remotePeerDescriptor)
        const offerer = getOfferer(toNodeId(localPeerDescriptor), toNodeId(remotePeerDescriptor))
        const accepted1 = fakeConnectorFacade.callOnNewConnection(pendingConnection1)
        expect(accepted1).toBeTrue()
        const pendingConnection2 = new PendingConnection(remotePeerDescriptor)
        const accepted2 = fakeConnectorFacade.callOnNewConnection(pendingConnection2)

        expect(accepted2).toBe(offerer === 'remote')

        pendingConnection1.close(true)
        pendingConnection2.close(true)
    })

    it('should replace a duplicate connected connection', () => {
        const remotePeerDescriptor = createMockPeerDescriptor()
        const pendingConnection1 = new PendingConnection(remotePeerDescriptor)
        const offerer = getOfferer(toNodeId(localPeerDescriptor), toNodeId(remotePeerDescriptor))
        const accepted1 = fakeConnectorFacade.callOnNewConnection(pendingConnection1)
        expect(accepted1).toBeTrue()
        pendingConnection1.onHandshakeCompleted(new MockConnection())
        const pendingConnection2 = new PendingConnection(remotePeerDescriptor)
        const accepted2 = fakeConnectorFacade.callOnNewConnection(pendingConnection2)
        if (accepted2) {
            pendingConnection1.onHandshakeCompleted(new MockConnection())
        }
        expect(accepted2).toBe(offerer === 'remote')

        pendingConnection1.close(true)
        pendingConnection2.close(true)
    })
})
