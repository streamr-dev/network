import { Logger } from '@streamr/utils'
import { Simulator } from '../../src/connection/simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockConnectionDhtNode, createMockConnectionLayer1Node } from '../utils/utils'
import { getTestInterface } from '@streamr/test-utils'
const logger = new Logger(module)

describe('Layer 1 on Layer 0 with mocked connections', () => {
    const simulator = new Simulator()
    const layer0EntryPointId = 'layer0entrypoint'

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

    let entryPointDescriptor: PeerDescriptor

    beforeEach(async () => {

        layer0EntryPoint = await createMockConnectionDhtNode(layer0EntryPointId, simulator)

        const layer0Node1Id = 'node1'
        layer0Node1 = await createMockConnectionDhtNode(layer0Node1Id, simulator)

        const layer0Node2Id = 'node2'
        layer0Node2 = await createMockConnectionDhtNode(layer0Node2Id, simulator)

        const layer0Node3Id = 'node3'
        layer0Node3 = await createMockConnectionDhtNode(layer0Node3Id, simulator)

        const layer0Node4Id = 'node4'
        layer0Node4 = await createMockConnectionDhtNode(layer0Node4Id, simulator)

        layer1EntryPoint = await createMockConnectionLayer1Node(layer0EntryPointId, layer0EntryPoint)

        layer1Node1 = await createMockConnectionLayer1Node(layer0Node1Id, layer0Node1)
        layer1Node2 = await createMockConnectionLayer1Node(layer0Node2Id, layer0Node2)
        layer1Node3 = await createMockConnectionLayer1Node(layer0Node3Id, layer0Node3)
        layer1Node4 = await createMockConnectionLayer1Node(layer0Node4Id, layer0Node4)

        entryPointDescriptor = {
            kademliaId: layer0EntryPoint.getNodeId().value,
            type: NodeType.NODEJS
        }

        await layer0EntryPoint.joinDht([entryPointDescriptor])
        await layer1EntryPoint.joinDht([entryPointDescriptor])
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
        await layer0Node1.joinDht([entryPointDescriptor])
        await layer0Node2.joinDht([entryPointDescriptor])
        await layer0Node3.joinDht([entryPointDescriptor])
        await layer0Node4.joinDht([entryPointDescriptor])

        await layer1Node1.joinDht([entryPointDescriptor])
        await layer1Node2.joinDht([entryPointDescriptor])
        await layer1Node3.joinDht([entryPointDescriptor])
        await layer1Node4.joinDht([entryPointDescriptor])

        logger.info('layer1EntryPoint.getBucketSize() ' + getTestInterface(getTestInterface(layer1EntryPoint).getPeerManager()).getKBucketSize())
        logger.info('layer1Node1.getBucketSize()' + getTestInterface(getTestInterface(layer1Node1).getPeerManager()).getKBucketSize())
        logger.info('layer1Node2.getBucketSize()' + getTestInterface(getTestInterface(layer1Node2).getPeerManager()).getKBucketSize())
        logger.info('layer1Node3.getBucketSize()' + getTestInterface(getTestInterface(layer1Node3).getPeerManager()).getKBucketSize())
        logger.info('layer1Node4.getBucketSize()' + getTestInterface(getTestInterface(layer1Node4).getPeerManager()).getKBucketSize())

        // eslint-disable-next-line max-len
        expect(getTestInterface(getTestInterface(layer1Node1).getPeerManager()).getKBucketSize()).toEqual(getTestInterface(getTestInterface(layer0Node1).getPeerManager()).getKBucketSize())
        // eslint-disable-next-line max-len
        expect(getTestInterface(getTestInterface(layer1Node2).getPeerManager()).getKBucketSize()).toEqual(getTestInterface(getTestInterface(layer0Node2).getPeerManager()).getKBucketSize())
        // eslint-disable-next-line max-len
        expect(getTestInterface(getTestInterface(layer1Node3).getPeerManager()).getKBucketSize()).toEqual(getTestInterface(getTestInterface(layer0Node3).getPeerManager()).getKBucketSize())
        // eslint-disable-next-line max-len
        expect(getTestInterface(getTestInterface(layer1Node4).getPeerManager()).getKBucketSize()).toEqual(getTestInterface(getTestInterface(layer0Node4).getPeerManager()).getKBucketSize())

        // eslint-disable-next-line max-len
        expect(getTestInterface(getTestInterface(layer1Node1).getPeerManager()).getKBucketPeers()).toContainValues(getTestInterface(getTestInterface(layer0Node1).getPeerManager()).getKBucketPeers())
        // eslint-disable-next-line max-len
        expect(getTestInterface(getTestInterface(layer1Node2).getPeerManager()).getKBucketPeers()).toContainValues(getTestInterface(getTestInterface(layer0Node2).getPeerManager()).getKBucketPeers())
        // eslint-disable-next-line max-len
        expect(getTestInterface(getTestInterface(layer1Node3).getPeerManager()).getKBucketPeers()).toContainValues(getTestInterface(getTestInterface(layer0Node3).getPeerManager()).getKBucketPeers())
        // eslint-disable-next-line max-len
        expect(getTestInterface(getTestInterface(layer1Node4).getPeerManager()).getKBucketPeers()).toContainValues(getTestInterface(getTestInterface(layer0Node4).getPeerManager()).getKBucketPeers())

    }, 60000)
})
