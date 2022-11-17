import { Simulator } from '../../src/connection/Simulator/Simulator'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { NodeType, PeerDescriptor } from '../../src/proto/DhtRpc'
import { waitForCondition } from '@streamr/utils'
import { PeerID } from '../../src/helpers/PeerID'
import { SimulatorTransport } from '../../src/exports'

describe('Connection Locking', () => {

    const mockPeerDescriptor1: PeerDescriptor = {
        kademliaId: PeerID.fromString("mock1").value,
        type: NodeType.NODEJS
    }
    const mockPeerDescriptor2: PeerDescriptor = {
        kademliaId: PeerID.fromString("mock2").value,
        type: NodeType.NODEJS
    }

    let mockConnectorTransport1: ConnectionManager
    let mockConnectorTransport2: ConnectionManager

    let connectionManager1: ConnectionManager
    let connectionManager2: ConnectionManager

    beforeEach(async () => {
        const simulator = new Simulator()
        mockConnectorTransport1 = new SimulatorTransport(mockPeerDescriptor1, simulator)
        mockConnectorTransport2 = new SimulatorTransport(mockPeerDescriptor2, simulator)

        connectionManager1 = new ConnectionManager({
            transportLayer: mockConnectorTransport1,
            webSocketHost: '127.0.0.1',
            webSocketPort: 12312
        })

        connectionManager2 = new ConnectionManager({
            transportLayer: mockConnectorTransport2,
            webSocketHost: '127.0.0.1',
            webSocketPort: 12313
        })
        await connectionManager1.start(() => mockPeerDescriptor1)
        await connectionManager2.start(() => mockPeerDescriptor2)
    })

    afterEach(async () => {
        await Promise.all([
            connectionManager1.stop(),
            connectionManager2.stop()
        ])
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
            waitForCondition(() => connectionManager2.hasRemoteLockedConnection(mockPeerDescriptor1, 'testLock2')),
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
            waitForCondition(() => connectionManager2.hasRemoteLockedConnection(mockPeerDescriptor1, 'testLock2')),
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
            connectionManager1.hasRemoteLockedConnection(mockPeerDescriptor2, 'testLock1')
            && !connectionManager1.hasLocalLockedConnection(mockPeerDescriptor2, 'testLock1')
            && !connectionManager2.hasRemoteLockedConnection(mockPeerDescriptor1, 'testLock1')
            && connectionManager2.hasLocalLockedConnection(mockPeerDescriptor1, 'testLock1')
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

        await connectionManager1.gracefullyDisconnect(mockPeerDescriptor2)
        await waitForCondition(() =>
            !connectionManager1.hasRemoteLockedConnection(mockPeerDescriptor2, 'testLock1')
            && !connectionManager1.hasLocalLockedConnection(mockPeerDescriptor2, 'testLock1')
        )
        await waitForCondition(() =>
            !connectionManager2.hasRemoteLockedConnection(mockPeerDescriptor1, 'testLock1')
            && !connectionManager2.hasLocalLockedConnection(mockPeerDescriptor1, 'testLock1')
        )
        await waitForCondition(() => !connectionManager2.hasConnection(mockPeerDescriptor1))
        await waitForCondition(() => !connectionManager1.hasConnection(mockPeerDescriptor2))

        expect(connectionManager1.hasConnection(mockPeerDescriptor2)).toEqual(false)
        expect(connectionManager2.hasConnection(mockPeerDescriptor1)).toEqual(false)
    })
})
