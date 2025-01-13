import { DhtNode } from '../../src/dht/DhtNode'
import { randomDhtAddress, toNodeId } from '../../src/identifiers'
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

        const layer0Node1Id = randomDhtAddress()
        layer0Node1 = new DhtNode({
            nodeId: layer0Node1Id,
            entryPoints: [entrypointDescriptor]
        })

        const layer0Node2Id = randomDhtAddress()
        layer0Node2 = new DhtNode({
            nodeId: layer0Node2Id,
            entryPoints: [entrypointDescriptor]
        })

        const layer0Node3Id = randomDhtAddress()
        layer0Node3 = new DhtNode({
            nodeId: layer0Node3Id,
            entryPoints: [entrypointDescriptor]
        })

        const layer0Node4Id = randomDhtAddress()
        layer0Node4 = new DhtNode({
            nodeId: layer0Node4Id,
            entryPoints: [entrypointDescriptor]
        })

        await layer0EntryPoint.start()
        await layer0Node1.start()
        await layer0Node2.start()
        await layer0Node3.start()
        await layer0Node4.start()

        layer1EntryPoint = new DhtNode({
            nodeId: toNodeId(entrypointDescriptor),
            transport: layer0EntryPoint,
            connectionsView: layer0EntryPoint.getConnectionsView(),
            serviceId: 'layer1'
        })

        layer1Node1 = new DhtNode({
            nodeId: layer0Node1Id,
            transport: layer0Node1,
            connectionsView: layer0Node1.getConnectionsView(),
            serviceId: 'layer1'
        })

        layer1Node2 = new DhtNode({
            nodeId: layer0Node2Id,
            transport: layer0Node2,
            connectionsView: layer0Node2.getConnectionsView(),
            serviceId: 'layer1'
        })

        layer1Node3 = new DhtNode({
            nodeId: layer0Node3Id,
            transport: layer0Node3,
            connectionsView: layer0Node3.getConnectionsView(),
            serviceId: 'layer1'
        })

        layer1Node4 = new DhtNode({
            nodeId: layer0Node4Id,
            transport: layer0Node4,
            connectionsView: layer0Node4.getConnectionsView(),
            serviceId: 'layer1'
        })

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

        expect(layer1Node1.getNeighborCount()).toBeGreaterThanOrEqual(2)
        expect(layer1Node2.getNeighborCount()).toBeGreaterThanOrEqual(2)
        expect(layer1Node3.getNeighborCount()).toBeGreaterThanOrEqual(2)
        expect(layer1Node4.getNeighborCount()).toBeGreaterThanOrEqual(2)
    }, 60000)
})
