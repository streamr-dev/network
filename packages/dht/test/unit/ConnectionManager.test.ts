import { MetricsContext, wait, waitForEvent } from '@streamr/utils'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { DhtAddress, toNodeId } from '../../src/identifiers'
import { PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
import { PendingConnection } from '../../src/connection/PendingConnection'
import { FakeConnectorFacade } from '../utils/FakeConnectorFacade'
import { MockConnection } from '../utils/mock/MockConnection'
import { createMockPeerDescriptor } from '../utils/utils'
import { getOfferer } from '../../src/helpers/offering'
import { ConnectionStatistics } from '../../src/connection/ConnectionStatistics'

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

    describe('statistics', () => {

        const SEND_STATISTICS = {
            bufferedAmount: 10, queuedMessages: 2, queuedBytes: 30, oldestQueuedMs: 5, offeredBytesPerSecond: 100, sentBytesPerSecond: 60
        }

        const createManager = async (statisticsInterval: number) => {
            let facade: FakeConnectorFacade
            const manager = new ConnectionManager({
                metricsContext: new MetricsContext(),
                allowIncomingPrivateConnections: false,
                statisticsInterval,
                createConnectorFacade: () => {
                    facade = new FakeConnectorFacade(localPeerDescriptor)
                    return facade
                }
            })
            await manager.start()
            const remotePeerDescriptor = createMockPeerDescriptor()
            const pendingConnection = new PendingConnection(remotePeerDescriptor)
            facade!.callOnNewConnection(pendingConnection)
            const connection = new MockConnection()
            connection.sendStatistics = SEND_STATISTICS
            pendingConnection.onHandshakeCompleted(connection)
            return { manager, remotePeerDescriptor, pendingConnection }
        }

        it('emits statisticsUpdated for connected peers', async () => {
            const { manager, remotePeerDescriptor, pendingConnection } = await createManager(10)
            const [peerDescriptor, statistics, nodeId] = await waitForEvent(manager, 'statisticsUpdated', 1000) as
                [PeerDescriptor, ConnectionStatistics, DhtAddress]
            expect(toNodeId(peerDescriptor)).toEqual(toNodeId(remotePeerDescriptor))
            expect(nodeId).toEqual(toNodeId(remotePeerDescriptor))
            expect(statistics).toMatchObject({ ...SEND_STATISTICS, backlogBytes: 40, receivedBytesPerSecond: 0 })
            expect(statistics.sampledAt).toBeGreaterThan(0)
            pendingConnection.close(true)
            await manager.stop()
        })

        it('is disabled when the interval is 0', async () => {
            const { manager, pendingConnection } = await createManager(0)
            await expect(waitForEvent(manager, 'statisticsUpdated', 100)).rejects.toThrow()
            pendingConnection.close(true)
            await manager.stop()
        })

        it('stops emitting after stop()', async () => {
            const { manager, pendingConnection } = await createManager(10)
            await waitForEvent(manager, 'statisticsUpdated', 1000)
            pendingConnection.close(true)
            await manager.stop()
            const listener = jest.fn()
            manager.on('statisticsUpdated', listener)
            await wait(50)
            expect(listener).not.toHaveBeenCalled()
        })
    })

})

