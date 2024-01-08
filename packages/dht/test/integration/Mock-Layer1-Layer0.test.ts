import { Logger } from '@streamr/utils'
import { Simulator } from '../../src/connection/simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { createMockConnectionDhtNode, createMockConnectionLayer1Node } from '../utils/utils'
import { createRandomDhtAddress } from '../../src/identifiers'

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

        layer0EntryPoint = await createMockConnectionDhtNode(simulator, createRandomDhtAddress())
        layer0Node1 = await createMockConnectionDhtNode(simulator, createRandomDhtAddress())
        layer0Node2 = await createMockConnectionDhtNode(simulator, createRandomDhtAddress())
        layer0Node3 = await createMockConnectionDhtNode(simulator, createRandomDhtAddress())
        layer0Node4 = await createMockConnectionDhtNode(simulator, createRandomDhtAddress())

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

        logger.info('layer1EntryPoint.getNumberOfNeighbors() ' + layer1EntryPoint.getNumberOfNeighbors())
        logger.info('layer1Node1.getNumberOfNeighbors()' + layer1Node1.getNumberOfNeighbors())
        logger.info('layer1Node2.getNumberOfNeighbors()' + layer1Node2.getNumberOfNeighbors())
        logger.info('layer1Node3.getNumberOfNeighbors()' + layer1Node3.getNumberOfNeighbors())
        logger.info('layer1Node4.getNumberOfNeighbors()' + layer1Node4.getNumberOfNeighbors())

        expect(layer1Node1.getNumberOfNeighbors()).toEqual(layer0Node1.getNumberOfNeighbors())
        expect(layer1Node2.getNumberOfNeighbors()).toEqual(layer0Node2.getNumberOfNeighbors())
        expect(layer1Node3.getNumberOfNeighbors()).toEqual(layer0Node3.getNumberOfNeighbors())
        expect(layer1Node4.getNumberOfNeighbors()).toEqual(layer0Node4.getNumberOfNeighbors())

        expect(layer1Node1.getAllNeighborPeerDescriptors()).toContainValues(layer0Node1.getAllNeighborPeerDescriptors())
        expect(layer1Node2.getAllNeighborPeerDescriptors()).toContainValues(layer0Node2.getAllNeighborPeerDescriptors())
        expect(layer1Node3.getAllNeighborPeerDescriptors()).toContainValues(layer0Node3.getAllNeighborPeerDescriptors())
        expect(layer1Node4.getAllNeighborPeerDescriptors()).toContainValues(layer0Node4.getAllNeighborPeerDescriptors())

    }, 60000)
})
