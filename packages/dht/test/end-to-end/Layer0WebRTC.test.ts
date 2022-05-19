// const log = require('why-is-node-running')

import { NodeType, PeerDescriptor } from '../../src/proto/DhtRpc'
import { DhtNode } from '../../src/dht/DhtNode'
import { PeerID } from '../../src/PeerID'
import { ConnectionType } from '../../src/connection/IConnection'

describe('Layer0 with WebRTC connections', () => {
    const epPeerDescriptor: PeerDescriptor = {
        peerId: PeerID.fromString('entrypoint').value,
        type: NodeType.NODEJS,
        websocket: { ip: 'localhost', port: 10029 }
    }
    let epDhtNode: DhtNode
    let node1: DhtNode
    let node2: DhtNode
    let node3: DhtNode
    let node4: DhtNode

    beforeEach(async () => {

        epDhtNode = new DhtNode({ peerDescriptor: epPeerDescriptor })
        await epDhtNode.start()

        await epDhtNode.joinDht(epPeerDescriptor)

        node1 = new DhtNode({peerIdString: 'Peer0', entryPoints: [epPeerDescriptor]})
        node2 = new DhtNode({peerIdString: 'Peer1', entryPoints: [epPeerDescriptor]})
        node3 = new DhtNode({peerIdString: 'Peer2', entryPoints: [epPeerDescriptor]})
        node4 = new DhtNode({peerIdString: 'Peer3', entryPoints: [epPeerDescriptor]})

        await node1.start()
        await node2.start()
        await node3.start()
        await node4.start()

        await epDhtNode.joinDht(epPeerDescriptor)
    })

    afterEach(async () => {
        await Promise.all([
            node1.stop(),
            node2.stop(),
            node3.stop(),
            node4.stop(),
            epDhtNode.stop()
        ])

        // setTimeout(() => log(), 10000)
    })

    it.only('Happy path one by one', async () => {
        await node1.joinDht(epPeerDescriptor)
        await node2.joinDht(epPeerDescriptor)
        // await node3.joinDht(epPeerDescriptor)
        // await node4.joinDht(epPeerDescriptor)

        expect(node1.getRpcCommunicator().getConnectionManager().hasConnection(node2.getPeerDescriptor())).toEqual(true)
        expect(node2.getRpcCommunicator().getConnectionManager().hasConnection(node1.getPeerDescriptor())).toEqual(true)
        expect(node1.getRpcCommunicator().getConnectionManager().getConnection(node2.getPeerDescriptor())!.connectionType)
            .toEqual(ConnectionType.WEBRTC)
        expect(node2.getRpcCommunicator().getConnectionManager().getConnection(node1.getPeerDescriptor())!.connectionType)
            .toEqual(ConnectionType.WEBRTC)
    }, 25000)

    it('Happy path simultaneous', async () => {
        await Promise.all([
            node1.joinDht(epPeerDescriptor),
            node2.joinDht(epPeerDescriptor),
            node3.joinDht(epPeerDescriptor),
            node4.joinDht(epPeerDescriptor)
        ])

        expect(node1.getRpcCommunicator().getConnectionManager().hasConnection(node2.getPeerDescriptor())).toEqual(true)
        expect(node2.getRpcCommunicator().getConnectionManager().hasConnection(node1.getPeerDescriptor())).toEqual(true)
        expect(node1.getRpcCommunicator().getConnectionManager().getConnection(node2.getPeerDescriptor())!.connectionType)
            .toEqual(ConnectionType.WEBRTC)
        expect(node2.getRpcCommunicator().getConnectionManager().getConnection(node1.getPeerDescriptor())!.connectionType)
            .toEqual(ConnectionType.WEBRTC)
    })
})