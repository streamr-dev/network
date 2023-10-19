import { areEqualBinaries, waitForEvent3 } from '@streamr/utils'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { ConnectionType } from '../../src/connection/IConnection'
import { DhtNode } from '../../src/dht/DhtNode'
import { PeerID } from '../../src/helpers/PeerID'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'

describe('Layer0 with WebRTC connections', () => {
    const epPeerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString('entrypoint').value,
        type: NodeType.NODEJS,
        websocket: { host: '127.0.0.1', port: 10029, tls: false }
    }
    let epDhtNode: DhtNode
    let node1: DhtNode
    let node2: DhtNode
    let node3: DhtNode
    let node4: DhtNode

    beforeEach(async () => {

        epDhtNode = new DhtNode({
            peerDescriptor: epPeerDescriptor,
            numberOfNodesPerKBucket: 8,
            websocketServerEnableTls: false
        })
        await epDhtNode.start()

        await epDhtNode.joinDht([epPeerDescriptor])

        node1 = new DhtNode({ entryPoints: [epPeerDescriptor] })
        node2 = new DhtNode({ entryPoints: [epPeerDescriptor] })
        node3 = new DhtNode({ entryPoints: [epPeerDescriptor] })
        node4 = new DhtNode({ entryPoints: [epPeerDescriptor] })

        await Promise.all([
            node1.start(),
            node2.start(),
            node3.start(),
            node4.start()
        ])

        await epDhtNode.joinDht([epPeerDescriptor])
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

    it('Happy path two peers', async () => {

        await Promise.all([
            waitForEvent3<any>(
                node2 as any,
                'connected',
                20000,
                (peerDescriptor: PeerDescriptor) => {
                    return areEqualBinaries(peerDescriptor.kademliaId, node1.getPeerDescriptor().kademliaId)
                }
            ),
            node2.joinDht([epPeerDescriptor]),
            node1.joinDht([epPeerDescriptor])
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
            node1.joinDht([epPeerDescriptor]),
            node2.joinDht([epPeerDescriptor]),
            node3.joinDht([epPeerDescriptor]),
            node4.joinDht([epPeerDescriptor])
        ])

        expect((node1.getTransport() as ConnectionManager).hasConnection(node2.getPeerDescriptor())).toEqual(true)
        expect((node2.getTransport() as ConnectionManager).hasConnection(node1.getPeerDescriptor())).toEqual(true)
        expect((node1.getTransport() as ConnectionManager).getConnection(node2.getPeerDescriptor())!.connectionType)
            .toEqual(ConnectionType.WEBRTC)
        expect((node2.getTransport() as ConnectionManager).getConnection(node1.getPeerDescriptor())!.connectionType)
            .toEqual(ConnectionType.WEBRTC)
    })
})
