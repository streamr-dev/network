import { PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { DhtNode } from '../../src/dht/DhtNode'

describe('Layer0', () => {

    let epPeerDescriptor: PeerDescriptor
    
    let epDhtNode: DhtNode
    let node1: DhtNode
    let node2: DhtNode
    let node3: DhtNode
    let node4: DhtNode

    const websocketPortRange = { min: 10012, max: 10015 } 
    beforeEach(async () => {
        
        epDhtNode = new DhtNode({ websocketHost: '127.0.0.1', websocketPortRange: { min: 10011, max: 10011 }, websocketServerEnableTls: false })
        await epDhtNode.start()
        epPeerDescriptor = epDhtNode.getLocalPeerDescriptor()
        await epDhtNode.joinDht([epPeerDescriptor])

        node1 = new DhtNode({ 
            websocketPortRange,
            websocketHost: '127.0.0.1',
            entryPoints: [epPeerDescriptor],
            websocketServerEnableTls: false
        })
        node2 = new DhtNode({ 
            websocketPortRange,
            websocketHost: '127.0.0.1',
            entryPoints: [epPeerDescriptor],
            websocketServerEnableTls: false
        })
        node3 = new DhtNode({ 
            websocketPortRange,
            websocketHost: '127.0.0.1',
            entryPoints: [epPeerDescriptor],
            websocketServerEnableTls: false
        })
        node4 = new DhtNode({ 
            websocketPortRange, 
            websocketHost: '127.0.0.1',
            entryPoints: [epPeerDescriptor],
            websocketServerEnableTls: false
        })
        
        await Promise.all([
            node1.start(),
            node2.start(),
            node3.start(),
            node4.start()
        ])

    }, 10000)

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
