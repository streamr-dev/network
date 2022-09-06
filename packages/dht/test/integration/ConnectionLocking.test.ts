import { PeerDescriptor, PeerID, Simulator, SimulatorTransport } from '../../src'
import { ConnectionManager, Events as ConnectionManagerEvents } from '../../src/connection/ConnectionManager'
import { NodeType } from '../../src/proto/DhtRpc'
import { waitForEvent3 } from '../../src/helpers/waitForEvent3'
import { waitForCondition } from 'streamr-test-utils'

describe('Connection Locking', () => {

    const mockPeerDescriptor1: PeerDescriptor = {
        peerId: PeerID.fromString("mock1").value,
        type: NodeType.NODEJS
    }
    const mockPeerDescriptor2: PeerDescriptor = {
        peerId: PeerID.fromString("mock2").value,
        type: NodeType.NODEJS
    }

    const simulator = new Simulator()

    let mockConnectorTransport1: SimulatorTransport
    let mockConnectorTransport2: SimulatorTransport

    let connectionManager1: ConnectionManager
    let connectionManager2: ConnectionManager

    beforeEach(async () => {
        mockConnectorTransport1 = new SimulatorTransport(mockPeerDescriptor1, simulator)
        mockConnectorTransport2 = new SimulatorTransport(mockPeerDescriptor2, simulator)

        connectionManager1 = new ConnectionManager({
            transportLayer: mockConnectorTransport1,
            webSocketHost: 'localhost',
            webSocketPort: 12312
        })

        connectionManager2 = new ConnectionManager({
            transportLayer: mockConnectorTransport2,
            webSocketHost: 'localhost',
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
        expect(connectionManager2.hasLocalLockedConnection(mockPeerDescriptor2))
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
        expect(connectionManager2.hasLocalLockedConnection(mockPeerDescriptor2))

        connectionManager1.unlockConnection(mockPeerDescriptor2, 'testLock1')
        expect(connectionManager1.hasLocalLockedConnection(mockPeerDescriptor2)).toEqual(true)

        connectionManager1.unlockConnection(mockPeerDescriptor2, 'testLock2')
        expect(connectionManager1.hasLocalLockedConnection(mockPeerDescriptor2)).toEqual(false)
        expect(connectionManager1.hasConnection(mockPeerDescriptor1)).toEqual(false)
    })
})
