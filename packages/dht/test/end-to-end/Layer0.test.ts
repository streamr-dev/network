import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { NodeType, PeerDescriptor } from '../../src/proto/DhtRpc'
import { DhtNode } from '../../src/dht/DhtNode'
import { createLayer0Peer, createPeerDescriptor } from '../utils'

describe('Layer0', () => {
    const epPeerDescriptor = {
        peerId: Uint8Array.from([1, 2, 3]),
        type: NodeType.NODEJS,
        websocket: { ip: 'localhost', port: 10001 }
    }
    let epConnectionManager: ConnectionManager
    let epDhtNode: DhtNode

    let connectionManager1: ConnectionManager
    let connectionManager2: ConnectionManager
    let connectionManager3: ConnectionManager
    let connectionManager4: ConnectionManager
    let peerDescriptor1: PeerDescriptor
    let peerDescriptor2: PeerDescriptor
    let peerDescriptor3: PeerDescriptor
    let peerDescriptor4: PeerDescriptor
    let node1: DhtNode
    let node2: DhtNode
    let node3: DhtNode
    let node4: DhtNode

    beforeEach(async () => {
        epConnectionManager = new ConnectionManager({
            webSocketHost: 'localhost',
            webSocketPort: epPeerDescriptor.websocket.port
        })
        await epConnectionManager.start()
        epConnectionManager.enableConnectivity(epPeerDescriptor)

        epDhtNode = createLayer0Peer(epPeerDescriptor, epConnectionManager)

        await epDhtNode.joinDht(epPeerDescriptor)

        connectionManager1 = new ConnectionManager({
            webSocketPort: 10002,
            entryPoints: [
                epPeerDescriptor
            ]
        })
        connectionManager2 = new ConnectionManager({
            webSocketPort: 10003,
            entryPoints: [
                epPeerDescriptor
            ]
        })
        connectionManager3 = new ConnectionManager({
            webSocketPort: 10004,
            entryPoints: [
                epPeerDescriptor
            ]
        })
        connectionManager4 = new ConnectionManager({
            webSocketPort: 10005,
            entryPoints: [
                epPeerDescriptor
            ]
        })
        const [ res1, res2, res3, res4 ] = await Promise.all([
            connectionManager1.start(),
            connectionManager2.start(),
            connectionManager3.start(),
            connectionManager4.start(),
        ])
        peerDescriptor1 = createPeerDescriptor(res1, '1')
        peerDescriptor2 = createPeerDescriptor(res2, '2')
        peerDescriptor3 = createPeerDescriptor(res3, '3')
        peerDescriptor4 = createPeerDescriptor(res4, '4')

        connectionManager1.enableConnectivity(peerDescriptor1)
        connectionManager2.enableConnectivity(peerDescriptor2)
        connectionManager3.enableConnectivity(peerDescriptor3)
        connectionManager4.enableConnectivity(peerDescriptor4)

        node1 = createLayer0Peer(peerDescriptor1, connectionManager1)
        node2 = createLayer0Peer(peerDescriptor2, connectionManager2)
        node3 = createLayer0Peer(peerDescriptor3, connectionManager3)
        node4 = createLayer0Peer(peerDescriptor4, connectionManager4)
    })

    afterEach(async() => {
        await Promise.all([
            epConnectionManager.stop(),
            connectionManager1.stop(),
            connectionManager2.stop(),
            connectionManager3.stop(),
            connectionManager4.stop(),
            node1.stop(),
            node2.stop(),
            node3.stop(),
            node4.stop()
        ])
    })

    it('Happy path', async () => {
        await Promise.all([
            node1.joinDht(epPeerDescriptor),
            node2.joinDht(epPeerDescriptor),
            node3.joinDht(epPeerDescriptor),
            node4.joinDht(epPeerDescriptor)
        ])
        expect(node1.getBucketSize()).toBeGreaterThanOrEqual(3)
        expect(node2.getBucketSize()).toBeGreaterThanOrEqual(4)
        expect(node3.getBucketSize()).toBeGreaterThanOrEqual(4)
        expect(node4.getBucketSize()).toBeGreaterThanOrEqual(2)

    })
})
