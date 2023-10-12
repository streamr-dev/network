import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { DhtNode } from '../../src/dht/DhtNode'

describe('Layer0', () => {
    
    let epDhtNode: DhtNode
    let node1: DhtNode
    let node2: DhtNode
    let node3: DhtNode
    let node4: DhtNode

    let epPeerDescriptor: PeerDescriptor

    const websocketPortRange = { min: 10012, max: 10015 } 
    beforeEach(async () => {
        
        epDhtNode = new DhtNode({ websocketHost: 'localhost', websocketPortRange: { min: 10011, max: 10012 }})
        await epDhtNode.start()
        epPeerDescriptor = epDhtNode.getPeerDescriptor()
        await epDhtNode.joinDht([epPeerDescriptor])

        console.log(epPeerDescriptor)
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

        expect(node1.getBucketSize()).toBeGreaterThanOrEqual(2)
        expect(node2.getBucketSize()).toBeGreaterThanOrEqual(2)
        expect(node3.getBucketSize()).toBeGreaterThanOrEqual(2)
        expect(node4.getBucketSize()).toBeGreaterThanOrEqual(2)
    }, 10000)
})
