import { DhtNode } from '../../src/dht/DhtNode'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { PeerID } from '../../src/exports'

describe('Layer 1 on Layer 0 with mocked connections', () => {
    const entryPointId = '00000'

    const entrypointDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString(entryPointId).value,
        type: NodeType.NODEJS,
        websocket: {
            ip: 'localhost',
            port: 23232
        }
    }

    let layer0EntryPoint: DhtNode
    let layer1Node1: DhtNode

    let layer0Node1: DhtNode
    let layer1EntryPoint: DhtNode

    let layer0Node2: DhtNode
    let layer1Node2: DhtNode

    let layer0Node3: DhtNode
    let layer1Node3: DhtNode

    let layer0Node4: DhtNode
    let layer1Node4: DhtNode

    beforeEach(async () => {

        layer0EntryPoint = new DhtNode({ peerDescriptor: entrypointDescriptor })

        const layer0Node1Id = 'layer0Node1'
        layer0Node1 = new DhtNode({
            peerIdString: layer0Node1Id
        })

        const layer0Node2Id = 'layer0Node2'
        layer0Node2 = new DhtNode({
            peerIdString: layer0Node2Id
        })

        const layer0Node3Id = 'layer0Node3'
        layer0Node3 = new DhtNode({
            peerIdString: layer0Node3Id
        })

        const layer0Node4Id = 'layer0Node4'
        layer0Node4 = new DhtNode({
            peerIdString: layer0Node4Id
        })

        layer1EntryPoint = new DhtNode({
            peerIdString: entryPointId,
            transportLayer: layer0EntryPoint,
            serviceId: 'layer1'
        })

        layer1Node1 = new DhtNode({
            peerIdString: layer0Node1Id,
            transportLayer: layer0Node1,
            serviceId: 'layer1'
        })

        layer1Node2 = new DhtNode({
            peerIdString: layer0Node2Id,
            transportLayer: layer0Node2,
            serviceId: 'layer1'
        })

        layer1Node3 = new DhtNode({
            peerIdString: layer0Node3Id,
            transportLayer: layer0Node3,
            serviceId: 'layer1'
        })

        layer1Node4 = new DhtNode({
            peerIdString: layer0Node4Id,
            transportLayer: layer0Node4,
            serviceId: 'layer1'
        })

        await layer0EntryPoint.start()
        await layer0Node1.start()
        await layer0Node2.start()
        await layer0Node3.start()
        await layer0Node4.start()
        await layer1EntryPoint.start()
        await layer1Node1.start()
        await layer1Node2.start()
        await layer1Node3.start()
        await layer1Node4.start()

        await layer0EntryPoint.joinDht(entrypointDescriptor)
        await layer1EntryPoint.joinDht(entrypointDescriptor)
    })

    afterEach(async () => {
        await Promise.all([
            layer0EntryPoint.stop(),
            layer0Node1.stop(),
            layer0Node2.stop(),
            layer0Node3.stop(),
            layer0Node4.stop(),
            layer1EntryPoint.stop(),
            layer1Node1.stop(),
            layer1Node2.stop(),
            layer1Node3.stop(),
            layer1Node4.stop()
        ])
    })

    it('Happy Path', async () => {
        await Promise.all([
            layer0Node1.joinDht(entrypointDescriptor),
            layer0Node2.joinDht(entrypointDescriptor),
            layer0Node3.joinDht(entrypointDescriptor),
            layer0Node4.joinDht(entrypointDescriptor)
        ])

        //await Promise.all([
        await layer1Node1.joinDht(entrypointDescriptor)
        await layer1Node2.joinDht(entrypointDescriptor)
        await layer1Node3.joinDht(entrypointDescriptor)
        await layer1Node4.joinDht(entrypointDescriptor)
        //])

        expect(layer1Node1.getBucketSize()).toBeGreaterThanOrEqual(2)
        expect(layer1Node2.getBucketSize()).toBeGreaterThanOrEqual(2)
        expect(layer1Node3.getBucketSize()).toBeGreaterThanOrEqual(2)
        expect(layer1Node4.getBucketSize()).toBeGreaterThanOrEqual(2)
    }, 60000)
})
