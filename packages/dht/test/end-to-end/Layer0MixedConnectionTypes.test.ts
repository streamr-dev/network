import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { DhtNode } from '../../src/dht/DhtNode'
import { waitForEvent3 } from '@streamr/utils'
import { ConnectionManager, Events as ConnectionManagerEvents } from '../../src/connection/ConnectionManager'
import { getTI } from '@streamr/test-utils'

describe('Layer0MixedConnectionTypes', () => {

    const epPeerDescriptor: PeerDescriptor = {
        kademliaId: Uint8Array.from([1, 2, 3]),
        type: NodeType.NODEJS,
        websocket: { ip: '127.0.0.1', port: 11221 }
    }

    let epDhtNode: DhtNode
    let node1: DhtNode
    let node2: DhtNode
    let node3: DhtNode
    let node4: DhtNode
    let node5: DhtNode

    const websocketPortRange = { min: 11222, max: 11223 }
    beforeEach(async () => {

        epDhtNode = new DhtNode({ peerDescriptor: epPeerDescriptor, numberOfNodesPerKBucket: 2 })
        await epDhtNode.start()

        await epDhtNode.joinDht([epPeerDescriptor])
        node1 = new DhtNode({ peerIdString: 'Peer1', websocketPortRange, entryPoints: [epPeerDescriptor] })
        node2 = new DhtNode({ peerIdString: 'Peer2', websocketPortRange, entryPoints: [epPeerDescriptor] })
        node3 = new DhtNode({ peerIdString: 'Peer3', entryPoints: [epPeerDescriptor] })
        node4 = new DhtNode({ peerIdString: 'Peer4', entryPoints: [epPeerDescriptor] })
        node5 = new DhtNode({ peerIdString: 'Peer5', entryPoints: [epPeerDescriptor] })

        await Promise.all([
            node1.start(),
            node2.start(),
            node3.start(),
            node4.start(),
            node5.start()
        ])

        await epDhtNode.joinDht([epPeerDescriptor])
    })

    afterEach(async () => {
        await Promise.all([
            epDhtNode.stop(),
            node1.stop(),
            node2.stop(),
            node3.stop(),
            node4.stop(),
            node5.stop()
        ])
    })

    it('2 non-server peers join first', async () => {

        const promise = Promise.all([
            waitForEvent3<ConnectionManagerEvents>((node3.getTransport() as ConnectionManager), 'newConnection'),
            waitForEvent3<ConnectionManagerEvents>((node4.getTransport() as ConnectionManager), 'newConnection'),
        ])

        node3.joinDht([epPeerDescriptor])
        node4.joinDht([epPeerDescriptor])

        await promise
        await Promise.all([
            node1.joinDht([epPeerDescriptor]),
            node2.joinDht([epPeerDescriptor]),
            node5.joinDht([epPeerDescriptor])
        ])

        expect(getTI(node1).getBucketSize()).toBeGreaterThanOrEqual(2)
        expect(getTI(node2).getBucketSize()).toBeGreaterThanOrEqual(2)
        expect(getTI(node3).getBucketSize()).toBeGreaterThanOrEqual(2)
        expect(getTI(node4).getBucketSize()).toBeGreaterThanOrEqual(2)
        expect(getTI(node5).getBucketSize()).toBeGreaterThanOrEqual(1)

    }, 15000)

    it('Simultaneous joins', async () => {
        await Promise.all([
            node1.joinDht([epPeerDescriptor]),
            node2.joinDht([epPeerDescriptor]),
            node3.joinDht([epPeerDescriptor]),
            node4.joinDht([epPeerDescriptor]),
            node5.joinDht([epPeerDescriptor])
        ])
        expect(getTI(node1).getBucketSize()).toBeGreaterThanOrEqual(2)
        expect(getTI(node2).getBucketSize()).toBeGreaterThanOrEqual(2)
        expect(getTI(node3).getBucketSize()).toBeGreaterThanOrEqual(2)
        expect(getTI(node4).getBucketSize()).toBeGreaterThanOrEqual(2)
        expect(getTI(node5).getBucketSize()).toBeGreaterThanOrEqual(2)
    }, 30000)
})
