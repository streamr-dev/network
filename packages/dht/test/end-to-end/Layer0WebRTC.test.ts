import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { DhtNode } from '../../src/dht/DhtNode'
import { PeerID } from '../../src/helpers/PeerID'
import { ConnectionType } from '../../src/connection/IConnection'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import EventEmitter from 'events'
import { waitForEvent } from '@streamr/utils'

describe('Layer0 with WebRTC connections', () => {
    const epPeerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString('entrypoint').value,
        nodeName: 'entrypoint',
        type: NodeType.NODEJS,
        websocket: { ip: '127.0.0.1', port: 10029 }
    }
    let epDhtNode: DhtNode
    let node1: DhtNode
    let node2: DhtNode
    let node3: DhtNode
    let node4: DhtNode

    beforeEach(async () => {

        epDhtNode = new DhtNode({ peerDescriptor: epPeerDescriptor, nodeName: 'entrypoint', numberOfNodesPerKBucket: 8 })
        await epDhtNode.start()

        await epDhtNode.joinDht(epPeerDescriptor)

        node1 = new DhtNode({ peerIdString: 'Peer0', nodeName: 'Peer0', entryPoints: [epPeerDescriptor] })
        node2 = new DhtNode({ peerIdString: 'Peer1', nodeName: 'Peer1', entryPoints: [epPeerDescriptor] })
        node3 = new DhtNode({ peerIdString: 'Peer2', nodeName: 'Peer2', entryPoints: [epPeerDescriptor] })
        node4 = new DhtNode({ peerIdString: 'Peer3', nodeName: 'Peer3', entryPoints: [epPeerDescriptor] })

        await Promise.all([
            node1.start(),
            node2.start(),
            node3.start(),
            node4.start()
        ])

        await epDhtNode.joinDht(epPeerDescriptor)
    })

    afterEach(async () => {
        await Promise.all([
            node1.stop(),
            node2.stop(),
            node3.stop(),
            node4.stop()
        ])
        await epDhtNode.stop()
    })

    class Peer0Listener extends EventEmitter {
        constructor(private nodeToListen: DhtNode) {
            super()
            nodeToListen.on('connected', (peer: PeerDescriptor) => {
                if (PeerID.fromValue(peer.kademliaId).equals(PeerID.fromString('Peer0'))) {
                    this.emit('peer0connected')
                }
            })
        }
    }

    it('Happy path two peers', async () => {

        await Promise.all([waitForEvent(new Peer0Listener(node2), 'peer0connected', 20000),
            node2.joinDht(epPeerDescriptor),
            node1.joinDht(epPeerDescriptor)
        ])

        expect((node1.getTransport() as ConnectionManager).hasConnection(node2.getPeerDescriptor())).toEqual(true)
        expect((node2.getTransport() as ConnectionManager).hasConnection(node1.getPeerDescriptor())).toEqual(true)
        expect((node1.getTransport() as ConnectionManager).getConnection(node2.getPeerDescriptor())!.connectionType)
            .toEqual(ConnectionType.WEBRTC)
        expect((node2.getTransport() as ConnectionManager).getConnection(node1.getPeerDescriptor())!.connectionType)
            .toEqual(ConnectionType.WEBRTC)

    }, 60000)

    it('Happy path simultaneous joins', async () => {
        await Promise.all([
            node1.joinDht(epPeerDescriptor),
            node2.joinDht(epPeerDescriptor),
            node3.joinDht(epPeerDescriptor),
            node4.joinDht(epPeerDescriptor)
        ])

        expect((node1.getTransport() as ConnectionManager).hasConnection(node2.getPeerDescriptor())).toEqual(true)
        expect((node2.getTransport() as ConnectionManager).hasConnection(node1.getPeerDescriptor())).toEqual(true)
        expect((node1.getTransport() as ConnectionManager).getConnection(node2.getPeerDescriptor())!.connectionType)
            .toEqual(ConnectionType.WEBRTC)
        expect((node2.getTransport() as ConnectionManager).getConnection(node1.getPeerDescriptor())!.connectionType)
            .toEqual(ConnectionType.WEBRTC)
    })
})
