import { MetricsContext, waitForCondition } from '@streamr/utils'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { DefaultConnectorFacade } from '../../src/connection/ConnectorFacade'
import { LatencyType, Simulator } from '../../src/connection/simulator/Simulator'
import { SimulatorTransport } from '../../src/connection/simulator/SimulatorTransport'
import { ITransport } from '../../src/exports'
import { PeerID } from '../../src/helpers/PeerID'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { getRandomRegion } from '../../dist/src/connection/simulator/pings'

const createConnectionManager = (localPeerDescriptor: PeerDescriptor, transport: ITransport) => {
    return new ConnectionManager({
        createConnectorFacade: () => new DefaultConnectorFacade({
            transport,
            createLocalPeerDescriptor: () => localPeerDescriptor
        }),
        metricsContext: new MetricsContext()
    })
}

describe('Connection Locking', () => {

    const mockPeerDescriptor1: PeerDescriptor = {
        nodeId: PeerID.fromString('mock1').value,
        type: NodeType.NODEJS,
        region: getRandomRegion()
    }
    const mockPeerDescriptor2: PeerDescriptor = {
        nodeId: PeerID.fromString('mock2').value,
        type: NodeType.NODEJS,
        region: getRandomRegion()
    }

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
        await Promise.all([
            waitForCondition(() => connectionManager2.hasRemoteLockedConnection(mockPeerDescriptor1)),
            connectionManager1.lockConnection(mockPeerDescriptor2, 'testLock')
        ])
        expect(connectionManager1.hasConnection(mockPeerDescriptor2)).toEqual(true)
        expect(connectionManager1.hasLocalLockedConnection(mockPeerDescriptor2)).toEqual(true)
        expect(connectionManager2.hasRemoteLockedConnection(mockPeerDescriptor1)).toEqual(true)
    })

    it('Multiple services on the same peer', async () => {
        await Promise.all([
            waitForCondition(() => connectionManager2.hasRemoteLockedConnection(mockPeerDescriptor1)),
            connectionManager1.lockConnection(mockPeerDescriptor2, 'testLock1')
        ])
        await Promise.all([
            waitForCondition(() => connectionManager2.hasRemoteLockedConnection(mockPeerDescriptor1)),
            connectionManager1.lockConnection(mockPeerDescriptor2, 'testLock2')
        ])
        expect(connectionManager1.hasConnection(mockPeerDescriptor2)).toEqual(true)
        expect(connectionManager1.hasLocalLockedConnection(mockPeerDescriptor2)).toEqual(true)
        expect(connectionManager2.hasRemoteLockedConnection(mockPeerDescriptor1)).toEqual(true)
    })

    it('can unlock connections', async () => {
        await Promise.all([
            waitForCondition(() => connectionManager2.hasRemoteLockedConnection(mockPeerDescriptor1)),
            connectionManager1.lockConnection(mockPeerDescriptor2, 'testLock')
        ])
        expect(connectionManager1.hasConnection(mockPeerDescriptor2))
        expect(connectionManager2.hasLocalLockedConnection(mockPeerDescriptor2)).toEqual(false)
        expect(connectionManager2.hasRemoteLockedConnection(mockPeerDescriptor1)).toEqual(true)

        connectionManager1.unlockConnection(mockPeerDescriptor2, 'testLock')
        expect(connectionManager1.hasLocalLockedConnection(mockPeerDescriptor2)).toEqual(false)
        await waitForCondition(() => connectionManager2.hasRemoteLockedConnection(mockPeerDescriptor1) === false)
        expect(connectionManager1.hasConnection(mockPeerDescriptor1)).toEqual(false)
    })

    it('unlocking multiple services', async () => {
        await Promise.all([
            waitForCondition(() => connectionManager2.hasRemoteLockedConnection(mockPeerDescriptor1)),
            connectionManager1.lockConnection(mockPeerDescriptor2, 'testLock1')
        ])
        await Promise.all([
            waitForCondition(() => connectionManager2.hasRemoteLockedConnection(mockPeerDescriptor1)),
            connectionManager1.lockConnection(mockPeerDescriptor2, 'testLock2')
        ])

        expect(connectionManager1.hasConnection(mockPeerDescriptor2))
        expect(connectionManager2.hasLocalLockedConnection(mockPeerDescriptor1)).toEqual(false)

        connectionManager1.unlockConnection(mockPeerDescriptor2, 'testLock1')
        expect(connectionManager1.hasLocalLockedConnection(mockPeerDescriptor2)).toEqual(true)

        connectionManager1.unlockConnection(mockPeerDescriptor2, 'testLock2')
        expect(connectionManager1.hasLocalLockedConnection(mockPeerDescriptor2)).toEqual(false)
        expect(connectionManager1.hasConnection(mockPeerDescriptor1)).toEqual(false)
    })

    it('maintains connection if both sides initially lock and then one end unlocks', async () => {
        await Promise.all([
            waitForCondition(() => connectionManager2.hasRemoteLockedConnection(mockPeerDescriptor1)),
            waitForCondition(() => connectionManager1.hasRemoteLockedConnection(mockPeerDescriptor2)),
            connectionManager1.lockConnection(mockPeerDescriptor2, 'testLock1'),
            connectionManager2.lockConnection(mockPeerDescriptor1, 'testLock1')
        ])

        expect(connectionManager1.hasLocalLockedConnection(mockPeerDescriptor2))
        expect(connectionManager2.hasLocalLockedConnection(mockPeerDescriptor1))

        connectionManager1.unlockConnection(mockPeerDescriptor2, 'testLock1')
        await waitForCondition(() =>
            connectionManager1.hasRemoteLockedConnection(mockPeerDescriptor2)
            && !connectionManager1.hasLocalLockedConnection(mockPeerDescriptor2)
            && !connectionManager2.hasRemoteLockedConnection(mockPeerDescriptor1)
            && connectionManager2.hasLocalLockedConnection(mockPeerDescriptor1)
        )
        
        expect(connectionManager2.hasConnection(mockPeerDescriptor1)).toEqual(true)
        expect(connectionManager1.hasConnection(mockPeerDescriptor2)).toEqual(true)
    })

    it('unlocks after graceful disconnect', async () => {
        await Promise.all([
            waitForCondition(() => connectionManager2.hasRemoteLockedConnection(mockPeerDescriptor1)),
            waitForCondition(() => connectionManager1.hasRemoteLockedConnection(mockPeerDescriptor2)),
            connectionManager1.lockConnection(mockPeerDescriptor2, 'testLock1'),
            connectionManager2.lockConnection(mockPeerDescriptor1, 'testLock1')
        ])
        expect(connectionManager1.hasConnection(mockPeerDescriptor2))
        expect(connectionManager2.hasLocalLockedConnection(mockPeerDescriptor1)).toEqual(true)
        expect(connectionManager2.hasRemoteLockedConnection(mockPeerDescriptor1)).toEqual(true)

        //@ts-expect-error private field
        await connectionManager1.gracefullyDisconnectAsync(mockPeerDescriptor2)
        
        await waitForCondition(() =>
            !connectionManager1.hasRemoteLockedConnection(mockPeerDescriptor2)
            && !connectionManager1.hasLocalLockedConnection(mockPeerDescriptor2)
        )
        await waitForCondition(() =>
            !connectionManager2.hasRemoteLockedConnection(mockPeerDescriptor1)
            && !connectionManager2.hasLocalLockedConnection(mockPeerDescriptor1)
        )
        await waitForCondition(() => !connectionManager2.hasConnection(mockPeerDescriptor1))
        await waitForCondition(() => !connectionManager1.hasConnection(mockPeerDescriptor2))

        expect(connectionManager1.hasConnection(mockPeerDescriptor2)).toEqual(false)
        expect(connectionManager2.hasConnection(mockPeerDescriptor1)).toEqual(false)
    }, 10000)
})
