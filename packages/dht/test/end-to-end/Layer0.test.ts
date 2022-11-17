import { NodeType, PeerDescriptor } from '../../src/proto/DhtRpc'
import { DhtNode } from '../../src/dht/DhtNode'

describe('Layer0', () => {

    const epPeerDescriptor: PeerDescriptor = {
        kademliaId: Uint8Array.from([1, 2, 3]),
        type: NodeType.NODEJS,
        websocket: { ip: '127.0.0.1', port: 10011 }
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

        node1 = new DhtNode({ peerIdString: '1', webSocketPort: 10012, entryPoints: [epPeerDescriptor] })
        node2 = new DhtNode({ peerIdString: '2', webSocketPort: 10013, entryPoints: [epPeerDescriptor] })
        node3 = new DhtNode({ peerIdString: '3', webSocketPort: 10014, entryPoints: [epPeerDescriptor] })
        node4 = new DhtNode({ peerIdString: '4', webSocketPort: 10015, entryPoints: [epPeerDescriptor] })
        
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
            node1.joinDht(epPeerDescriptor),
            node2.joinDht(epPeerDescriptor),
            node3.joinDht(epPeerDescriptor),
            node4.joinDht(epPeerDescriptor)
        ])
        expect(node1.getBucketSize()).toBeGreaterThanOrEqual(2)
        expect(node2.getBucketSize()).toBeGreaterThanOrEqual(2)
        expect(node3.getBucketSize()).toBeGreaterThanOrEqual(2)
        expect(node4.getBucketSize()).toBeGreaterThanOrEqual(2)
    })
})
