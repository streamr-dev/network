import { DhtNode } from '../../src/dht/DhtNode'
import { DhtAddress, getNodeIdFromPeerDescriptor } from '../../src/identifiers'
import { createMockPeerDescriptor } from '../utils/utils'

describe('Layer 1 on Layer 0 with mocked connections', () => {

    const entrypointDescriptor = createMockPeerDescriptor({
        websocket: {
            host: '127.0.0.1',
            port: 23232,
            tls: false
        }
    })
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

        layer0EntryPoint = new DhtNode({ peerDescriptor: entrypointDescriptor, websocketServerEnableTls: false })

        const layer0Node1Id = '11' as DhtAddress
        layer0Node1 = new DhtNode({
            nodeId: layer0Node1Id
        })

        const layer0Node2Id = '22' as DhtAddress
        layer0Node2 = new DhtNode({
            nodeId: layer0Node2Id
        })

        const layer0Node3Id = '33' as DhtAddress
        layer0Node3 = new DhtNode({
            nodeId: layer0Node3Id
        })

        const layer0Node4Id = '44' as DhtAddress
        layer0Node4 = new DhtNode({
            nodeId: layer0Node4Id
        })

        layer1EntryPoint = new DhtNode({
            nodeId: getNodeIdFromPeerDescriptor(entrypointDescriptor),
            transport: layer0EntryPoint,
            serviceId: 'layer1'
        })

        layer1Node1 = new DhtNode({
            nodeId: layer0Node1Id,
            transport: layer0Node1,
            serviceId: 'layer1'
        })

        layer1Node2 = new DhtNode({
            nodeId: layer0Node2Id,
            transport: layer0Node2,
            serviceId: 'layer1'
        })

        layer1Node3 = new DhtNode({
            nodeId: layer0Node3Id,
            transport: layer0Node3,
            serviceId: 'layer1'
        })

        layer1Node4 = new DhtNode({
            nodeId: layer0Node4Id,
            transport: layer0Node4,
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

        await layer0EntryPoint.joinDht([entrypointDescriptor])
        await layer1EntryPoint.joinDht([entrypointDescriptor])
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
            layer0Node1.joinDht([entrypointDescriptor]),
            layer0Node2.joinDht([entrypointDescriptor]),
            layer0Node3.joinDht([entrypointDescriptor]),
            layer0Node4.joinDht([entrypointDescriptor])
        ])

        await layer1Node1.joinDht([entrypointDescriptor])
        await layer1Node2.joinDht([entrypointDescriptor])
        await layer1Node3.joinDht([entrypointDescriptor])
        await layer1Node4.joinDht([entrypointDescriptor])

        expect(layer1Node1.getNumberOfNeighbors()).toBeGreaterThanOrEqual(2)
        expect(layer1Node2.getNumberOfNeighbors()).toBeGreaterThanOrEqual(2)
        expect(layer1Node3.getNumberOfNeighbors()).toBeGreaterThanOrEqual(2)
        expect(layer1Node4.getNumberOfNeighbors()).toBeGreaterThanOrEqual(2)
    }, 60000)
})
