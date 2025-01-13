import { areEqualBinaries, waitForEvent3 } from '@streamr/utils'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { DhtNode } from '../../src/dht/DhtNode'
import { PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
import { createMockPeerDescriptor } from '../utils/utils'
import { toNodeId } from '../../src/exports'

describe('Layer0 with WebRTC connections', () => {
    const epPeerDescriptor = createMockPeerDescriptor({
        websocket: { host: '127.0.0.1', port: 10029, tls: false }
    })
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

        await Promise.all([node1.start(), node2.start(), node3.start(), node4.start()])
    })

    afterEach(async () => {
        await Promise.all([node1.stop(), node2.stop(), node3.stop(), node4.stop()])
        await epDhtNode.stop()
    })

    it('Happy path two peers', async () => {
        await Promise.all([
            waitForEvent3<any>(node2 as any, 'connected', 20000, (peerDescriptor: PeerDescriptor) => {
                return areEqualBinaries(peerDescriptor.nodeId, node1.getLocalPeerDescriptor().nodeId)
            }),
            node2.joinDht([epPeerDescriptor]),
            node1.joinDht([epPeerDescriptor])
        ])
        const nodeId1 = toNodeId(node1.getLocalPeerDescriptor())
        const nodeId2 = toNodeId(node2.getLocalPeerDescriptor())
        expect((node1.getTransport() as ConnectionManager).hasConnection(nodeId2)).toEqual(true)
        expect((node2.getTransport() as ConnectionManager).hasConnection(nodeId1)).toEqual(true)
    }, 60000)

    it('Happy path simultaneous joins', async () => {
        await Promise.all([
            node1.joinDht([epPeerDescriptor]),
            node2.joinDht([epPeerDescriptor]),
            node3.joinDht([epPeerDescriptor]),
            node4.joinDht([epPeerDescriptor])
        ])
        const nodeId1 = toNodeId(node1.getLocalPeerDescriptor())
        const nodeId2 = toNodeId(node2.getLocalPeerDescriptor())
        expect((node1.getTransport() as ConnectionManager).hasConnection(nodeId2)).toEqual(true)
        expect((node2.getTransport() as ConnectionManager).hasConnection(nodeId1)).toEqual(true)
    })
})
