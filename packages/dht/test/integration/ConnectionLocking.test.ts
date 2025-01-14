import { MetricsContext, until } from '@streamr/utils'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { DefaultConnectorFacade } from '../../src/connection/ConnectorFacade'
import { LatencyType, Simulator } from '../../src/connection/simulator/Simulator'
import { SimulatorTransport } from '../../src/connection/simulator/SimulatorTransport'
import { ITransport } from '../../src/transport/ITransport'
import { PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
import { getRandomRegion } from '../../dist/src/connection/simulator/pings'
import { createMockPeerDescriptor } from '../utils/utils'
import { toNodeId } from '../../src/identifiers'

const createConnectionManager = (localPeerDescriptor: PeerDescriptor, transport: ITransport) => {
    return new ConnectionManager({
        createConnectorFacade: () =>
            new DefaultConnectorFacade({
                transport,
                createLocalPeerDescriptor: async () => localPeerDescriptor
            }),
        metricsContext: new MetricsContext(),
        allowIncomingPrivateConnections: true
    })
}

describe('Connection Locking', () => {
    const mockPeerDescriptor1 = createMockPeerDescriptor({
        region: getRandomRegion()
    })
    const mockPeerDescriptor2 = createMockPeerDescriptor({
        region: getRandomRegion()
    })
    let mockConnectorTransport1: ConnectionManager
    let mockConnectorTransport2: ConnectionManager
    let connectionManager1: ConnectionManager
    let connectionManager2: ConnectionManager
    let simulator: Simulator

    beforeEach(async () => {
        simulator = new Simulator(LatencyType.REAL)
        mockConnectorTransport1 = new SimulatorTransport(mockPeerDescriptor1, simulator)
        await mockConnectorTransport1.start()
        mockConnectorTransport2 = new SimulatorTransport(mockPeerDescriptor2, simulator)
        await mockConnectorTransport2.start()
        connectionManager1 = createConnectionManager(mockPeerDescriptor1, mockConnectorTransport1)
        connectionManager2 = createConnectionManager(mockPeerDescriptor2, mockConnectorTransport2)
        await connectionManager1.start()
        await connectionManager2.start()
    })

    afterEach(async () => {
        await Promise.all([
            mockConnectorTransport1.stop(),
            mockConnectorTransport2.stop(),
            connectionManager1.stop(),
            connectionManager2.stop()
        ])
        simulator.stop()
    })

    it('can lock connections', async () => {
        const nodeId1 = toNodeId(mockPeerDescriptor1)
        const nodeId2 = toNodeId(mockPeerDescriptor2)
        await Promise.all([
            until(() => connectionManager2.hasRemoteLockedConnection(nodeId1)),
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
            connectionManager1.lockConnection(mockPeerDescriptor2, 'testLock')
        ])
        expect(connectionManager1.hasConnection(nodeId2)).toEqual(true)
        expect(connectionManager1.hasLocalLockedConnection(nodeId2)).toEqual(true)
        expect(connectionManager2.hasRemoteLockedConnection(nodeId1)).toEqual(true)
    })

    it('Multiple services on the same peer', async () => {
        const nodeId1 = toNodeId(mockPeerDescriptor1)
        const nodeId2 = toNodeId(mockPeerDescriptor2)
        await Promise.all([
            until(() => connectionManager2.hasRemoteLockedConnection(nodeId1)),
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
            connectionManager1.lockConnection(mockPeerDescriptor2, 'testLock1')
        ])
        await Promise.all([
            until(() => connectionManager2.hasRemoteLockedConnection(nodeId1)),
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
            connectionManager1.lockConnection(mockPeerDescriptor2, 'testLock2')
        ])
        expect(connectionManager1.hasConnection(nodeId2)).toEqual(true)
        expect(connectionManager1.hasLocalLockedConnection(nodeId2)).toEqual(true)
        expect(connectionManager2.hasRemoteLockedConnection(nodeId1)).toEqual(true)
    })

    it('can unlock connections', async () => {
        const nodeId1 = toNodeId(mockPeerDescriptor1)
        const nodeId2 = toNodeId(mockPeerDescriptor2)
        await Promise.all([
            until(() => connectionManager2.hasRemoteLockedConnection(nodeId1)),
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
            connectionManager1.lockConnection(mockPeerDescriptor2, 'testLock')
        ])
        expect(connectionManager1.hasConnection(nodeId2)).toEqual(true)
        expect(connectionManager2.hasLocalLockedConnection(nodeId2)).toEqual(false)
        expect(connectionManager2.hasRemoteLockedConnection(nodeId1)).toEqual(true)

        connectionManager1.unlockConnection(mockPeerDescriptor2, 'testLock')
        expect(connectionManager1.hasLocalLockedConnection(nodeId2)).toEqual(false)
        await until(() => connectionManager2.hasRemoteLockedConnection(nodeId1) === false)
        expect(connectionManager1.hasConnection(nodeId1)).toEqual(false)
    })

    it('unlocking multiple services', async () => {
        const nodeId1 = toNodeId(mockPeerDescriptor1)
        const nodeId2 = toNodeId(mockPeerDescriptor2)
        await Promise.all([
            until(() => connectionManager2.hasRemoteLockedConnection(nodeId1)),
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
            connectionManager1.lockConnection(mockPeerDescriptor2, 'testLock1')
        ])
        await Promise.all([
            until(() => connectionManager2.hasRemoteLockedConnection(nodeId1)),
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
            connectionManager1.lockConnection(mockPeerDescriptor2, 'testLock2')
        ])

        expect(connectionManager1.hasConnection(nodeId2)).toEqual(true)
        expect(connectionManager2.hasLocalLockedConnection(nodeId1)).toEqual(false)

        connectionManager1.unlockConnection(mockPeerDescriptor2, 'testLock1')
        expect(connectionManager1.hasLocalLockedConnection(nodeId2)).toEqual(true)

        connectionManager1.unlockConnection(mockPeerDescriptor2, 'testLock2')
        expect(connectionManager1.hasLocalLockedConnection(nodeId2)).toEqual(false)
        expect(connectionManager1.hasConnection(nodeId1)).toEqual(false)
    })

    it('maintains connection if both sides initially lock and then one end unlocks', async () => {
        const nodeId1 = toNodeId(mockPeerDescriptor1)
        const nodeId2 = toNodeId(mockPeerDescriptor2)
        await Promise.all([
            until(() => connectionManager2.hasRemoteLockedConnection(nodeId1)),
            until(() => connectionManager1.hasRemoteLockedConnection(nodeId2)),
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
            connectionManager1.lockConnection(mockPeerDescriptor2, 'testLock1'),
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
            connectionManager2.lockConnection(mockPeerDescriptor1, 'testLock1')
        ])

        expect(connectionManager1.hasLocalLockedConnection(nodeId2)).toEqual(true)
        expect(connectionManager2.hasLocalLockedConnection(nodeId1)).toEqual(true)

        connectionManager1.unlockConnection(mockPeerDescriptor2, 'testLock1')
        await until(
            () =>
                connectionManager1.hasRemoteLockedConnection(nodeId2) &&
                !connectionManager1.hasLocalLockedConnection(nodeId2) &&
                !connectionManager2.hasRemoteLockedConnection(nodeId1) &&
                connectionManager2.hasLocalLockedConnection(nodeId1)
        )

        expect(connectionManager2.hasConnection(nodeId1)).toEqual(true)
        expect(connectionManager1.hasConnection(nodeId2)).toEqual(true)
    })

    it('unlocks after graceful disconnect', async () => {
        const nodeId1 = toNodeId(mockPeerDescriptor1)
        const nodeId2 = toNodeId(mockPeerDescriptor2)
        await Promise.all([
            until(() => connectionManager2.hasRemoteLockedConnection(nodeId1)),
            until(() => connectionManager1.hasRemoteLockedConnection(nodeId2)),
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
            connectionManager1.lockConnection(mockPeerDescriptor2, 'testLock1'),
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
            connectionManager2.lockConnection(mockPeerDescriptor1, 'testLock1')
        ])
        expect(connectionManager1.hasConnection(nodeId2)).toEqual(true)
        expect(connectionManager2.hasLocalLockedConnection(nodeId1)).toEqual(true)
        expect(connectionManager2.hasRemoteLockedConnection(nodeId1)).toEqual(true)

        //@ts-expect-error private field
        await connectionManager1.gracefullyDisconnectAsync(mockPeerDescriptor2)

        await until(
            () =>
                !connectionManager1.hasRemoteLockedConnection(nodeId2) &&
                !connectionManager1.hasLocalLockedConnection(nodeId2)
        )
        await until(
            () =>
                !connectionManager2.hasRemoteLockedConnection(nodeId1) &&
                !connectionManager2.hasLocalLockedConnection(nodeId1)
        )
        await until(() => !connectionManager2.hasConnection(nodeId1))
        await until(() => !connectionManager1.hasConnection(nodeId2))

        expect(connectionManager1.hasConnection(nodeId2)).toEqual(false)
        expect(connectionManager2.hasConnection(nodeId1)).toEqual(false)
    }, 10000)
})
