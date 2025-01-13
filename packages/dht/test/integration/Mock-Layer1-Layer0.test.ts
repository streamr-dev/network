import { Logger } from '@streamr/utils'
import { Simulator } from '../../src/connection/simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { createMockConnectionDhtNode, createMockConnectionLayer1Node } from '../utils/utils'
import { randomDhtAddress } from '../../src/identifiers'

const logger = new Logger(module)

describe('Layer 1 on Layer 0 with mocked connections', () => {
    const simulator = new Simulator()
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
        layer0EntryPoint = await createMockConnectionDhtNode(simulator, randomDhtAddress())
        layer0Node1 = await createMockConnectionDhtNode(simulator, randomDhtAddress())
        layer0Node2 = await createMockConnectionDhtNode(simulator, randomDhtAddress())
        layer0Node3 = await createMockConnectionDhtNode(simulator, randomDhtAddress())
        layer0Node4 = await createMockConnectionDhtNode(simulator, randomDhtAddress())

        layer1EntryPoint = await createMockConnectionLayer1Node(layer0EntryPoint)

        layer1Node1 = await createMockConnectionLayer1Node(layer0Node1)
        layer1Node2 = await createMockConnectionLayer1Node(layer0Node2)
        layer1Node3 = await createMockConnectionLayer1Node(layer0Node3)
        layer1Node4 = await createMockConnectionLayer1Node(layer0Node4)

        await layer0EntryPoint.joinDht([layer0EntryPoint.getLocalPeerDescriptor()])
        await layer1EntryPoint.joinDht([layer0EntryPoint.getLocalPeerDescriptor()])
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
        await layer0Node1.joinDht([layer0EntryPoint.getLocalPeerDescriptor()])
        await layer0Node2.joinDht([layer0EntryPoint.getLocalPeerDescriptor()])
        await layer0Node3.joinDht([layer0EntryPoint.getLocalPeerDescriptor()])
        await layer0Node4.joinDht([layer0EntryPoint.getLocalPeerDescriptor()])

        await layer1Node1.joinDht([layer0EntryPoint.getLocalPeerDescriptor()])
        await layer1Node2.joinDht([layer0EntryPoint.getLocalPeerDescriptor()])
        await layer1Node3.joinDht([layer0EntryPoint.getLocalPeerDescriptor()])
        await layer1Node4.joinDht([layer0EntryPoint.getLocalPeerDescriptor()])

        logger.info('layer1EntryPoint.getNeighborCount() ' + layer1EntryPoint.getNeighborCount())
        logger.info('layer1Node1.getNeighborCount()' + layer1Node1.getNeighborCount())
        logger.info('layer1Node2.getNeighborCount()' + layer1Node2.getNeighborCount())
        logger.info('layer1Node3.getNeighborCount()' + layer1Node3.getNeighborCount())
        logger.info('layer1Node4.getNeighborCount()' + layer1Node4.getNeighborCount())

        expect(layer1Node1.getNeighborCount()).toEqual(layer0Node1.getNeighborCount())
        expect(layer1Node2.getNeighborCount()).toEqual(layer0Node2.getNeighborCount())
        expect(layer1Node3.getNeighborCount()).toEqual(layer0Node3.getNeighborCount())
        expect(layer1Node4.getNeighborCount()).toEqual(layer0Node4.getNeighborCount())

        expect(layer1Node1.getNeighbors()).toContainValues(layer0Node1.getNeighbors())
        expect(layer1Node2.getNeighbors()).toContainValues(layer0Node2.getNeighbors())
        expect(layer1Node3.getNeighbors()).toContainValues(layer0Node3.getNeighbors())
        expect(layer1Node4.getNeighbors()).toContainValues(layer0Node4.getNeighbors())
    }, 60000)
})
