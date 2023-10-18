import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { DhtNode } from '../../src/dht/DhtNode'
import { getTestInterface } from '@streamr/test-utils'

describe('Layer0', () => {

    const epPeerDescriptor: PeerDescriptor = {
        kademliaId: Uint8Array.from([1, 2, 3]),
        type: NodeType.NODEJS,
        websocket: { host: '127.0.0.1', port: 10011, tls: false }
    }
    
    let epDhtNode: DhtNode
    let node1: DhtNode
    let node2: DhtNode
    let node3: DhtNode
    let node4: DhtNode

    const websocketPortRange = { min: 10012, max: 10015 } 
    beforeEach(async () => {
        
        epDhtNode = new DhtNode({ peerDescriptor: epPeerDescriptor })
        await epDhtNode.start()
        
        await epDhtNode.joinDht([epPeerDescriptor])

        node1 = new DhtNode({ websocketPortRange, entryPoints: [epPeerDescriptor] })
        node2 = new DhtNode({ websocketPortRange, entryPoints: [epPeerDescriptor] })
        node3 = new DhtNode({ websocketPortRange, entryPoints: [epPeerDescriptor] })
        node4 = new DhtNode({ websocketPortRange, entryPoints: [epPeerDescriptor] })
        
        await node1.start()
        await node2.start()
        await node3.start()
        await node4.start()

    })

    afterEach(async () => {
        await Promise.all([
            epDhtNode.stop(),
            node1.stop(),
            node2.stop(),
            node3.stop(),
            node4.stop()
        ])
    })

    it('Happy path', async () => {
        await Promise.all([
            node1.joinDht([epPeerDescriptor]),
            node2.joinDht([epPeerDescriptor]),
            node3.joinDht([epPeerDescriptor]),
            node4.joinDht([epPeerDescriptor])
        ])

        expect(getTestInterface(node1).getBucketSize()).toBeGreaterThanOrEqual(2)
        expect(getTestInterface(node2).getBucketSize()).toBeGreaterThanOrEqual(2)
        expect(getTestInterface(node3).getBucketSize()).toBeGreaterThanOrEqual(2)
        expect(getTestInterface(node4).getBucketSize()).toBeGreaterThanOrEqual(2)
    }, 10000)
})
