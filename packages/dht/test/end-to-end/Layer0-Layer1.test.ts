import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { NodeType, PeerDescriptor } from '../../src/proto/DhtRpc'
import { DhtNode } from '../../src/dht/DhtNode'
import { createLayer0Peer, createLayer1Peer, createPeerDescriptor } from '../utils'
import { PeerID } from '../../src/PeerID'

describe('Layer0-Layer1', () => {
    const epPeerDescriptor = {
        peerId: Uint8Array.from([1, 2, 3]),
        type: NodeType.NODEJS,
        websocket: { ip: 'localhost', port: 10011 }
    }
    const STREAM_ID1 = 'stream1'
    const STREAM_ID2 = 'stream2'

    let epConnectionManager: ConnectionManager
    let epDhtNode: DhtNode

    let connectionManager1: ConnectionManager
    let connectionManager2: ConnectionManager
    let peerDescriptor1: PeerDescriptor
    let peerDescriptor2: PeerDescriptor
    let node1: DhtNode
    let node2: DhtNode
    let stream1Node1: DhtNode
    let stream1Node2: DhtNode
    let stream2Node1: DhtNode
    let stream2Node2: DhtNode

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
            webSocketPort: 10012,
            entryPoints: [
                epPeerDescriptor
            ]
        })
        connectionManager2 = new ConnectionManager({
            webSocketPort: 10013,
            entryPoints: [
                epPeerDescriptor
            ]
        })

        const [ res1, res2 ] = await Promise.all([
            connectionManager1.start(),
            connectionManager2.start()
        ])
        peerDescriptor1 = createPeerDescriptor(res1, '1')
        peerDescriptor2 = createPeerDescriptor(res2, '2')

        connectionManager1.enableConnectivity(peerDescriptor1)
        connectionManager2.enableConnectivity(peerDescriptor2)

        node1 = createLayer0Peer(peerDescriptor1, connectionManager1)
        node2 = createLayer0Peer(peerDescriptor2, connectionManager2)
        stream1Node1 = createLayer1Peer(epPeerDescriptor, epDhtNode, STREAM_ID1)
        stream1Node2 = createLayer1Peer(peerDescriptor1, node1, STREAM_ID1)
        stream2Node1 = createLayer1Peer(epPeerDescriptor, epDhtNode, STREAM_ID2)
        stream2Node2 = createLayer1Peer(peerDescriptor2, node2, STREAM_ID2)
    })

    afterEach(async() => {
        await Promise.all([
            epConnectionManager.stop(),
            connectionManager1.stop(),
            connectionManager2.stop(),
            node1.stop(),
            node2.stop(),
            epDhtNode.stop()
        ])
    })

    it('Happy path', async () => {
        await Promise.all([
            node1.joinDht(epPeerDescriptor),
            node2.joinDht(epPeerDescriptor)
        ])
        await Promise.all([
            stream1Node1.joinDht(epPeerDescriptor),
            stream1Node2.joinDht(epPeerDescriptor)
        ])
        await Promise.all([
            stream2Node1.joinDht(epPeerDescriptor),
            stream2Node2.joinDht(epPeerDescriptor)
        ])
        expect(stream1Node1.getNeighborList().getSize()).toEqual(1)
        expect(stream1Node2.getNeighborList().getSize()).toEqual(1)
        expect(stream2Node1.getNeighborList().getSize()).toEqual(1)
        expect(stream2Node2.getNeighborList().getSize()).toEqual(1)

        expect(stream1Node1.getNeighborList().getContactIds()[0].equals(PeerID.fromValue(peerDescriptor1.peerId))).toEqual(true)
        expect(stream1Node2.getNeighborList().getContactIds()[0].equals(PeerID.fromValue(epPeerDescriptor.peerId))).toEqual(true)
        expect(stream2Node1.getNeighborList().getContactIds()[0].equals(PeerID.fromValue(peerDescriptor2.peerId))).toEqual(true)
        expect(stream2Node2.getNeighborList().getContactIds()[0].equals(PeerID.fromValue(epPeerDescriptor.peerId))).toEqual(true)
    })
})
