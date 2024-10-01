import { Simulator } from '@streamr/dht'
import { StreamPartIDUtils, waitForCondition } from '@streamr/utils'
import { range } from 'lodash'
import { ContentDeliveryLayerNode } from '../../src/logic/ContentDeliveryLayerNode'
import { DiscoveryLayerNode } from '../../src/logic/DiscoveryLayerNode'
import { createMockContentDeliveryLayerNodeAndDhtNode, createMockPeerDescriptor, createStreamMessage } from '../utils/utils'
import { randomUserIdOld } from '@streamr/test-utils'

describe('Propagation', () => {
    const entryPointDescriptor = createMockPeerDescriptor()
    let discoveryLayerNodes: DiscoveryLayerNode[]
    let contentDeliveryLayerNodes: ContentDeliveryLayerNode[]
    const STREAM_PART_ID = StreamPartIDUtils.parse('testingtesting#0')
    let totalReceived: number
    const NUM_OF_NODES = 256

    beforeEach(async () => {
        const simulator = new Simulator()
        totalReceived = 0
        discoveryLayerNodes = []
        contentDeliveryLayerNodes = []
        const [entryPoint, node1] = await createMockContentDeliveryLayerNodeAndDhtNode(
            entryPointDescriptor,
            entryPointDescriptor,
            STREAM_PART_ID,
            simulator
        )
        await entryPoint.start()
        await entryPoint.joinDht([entryPointDescriptor])
        await node1.start()
        node1.on('message', () => {totalReceived += 1})
        discoveryLayerNodes.push(entryPoint)
        contentDeliveryLayerNodes.push(node1)

        await Promise.all(range(NUM_OF_NODES).map(async (_i) => {
            const descriptor = createMockPeerDescriptor()
            const [layer1, contentDeliveryLayerNode] = await createMockContentDeliveryLayerNodeAndDhtNode(
                descriptor,
                entryPointDescriptor,
                STREAM_PART_ID,
                simulator
            )
            await layer1.start()
            await contentDeliveryLayerNode.start()
            await layer1.joinDht([entryPointDescriptor]).then(() => {
                contentDeliveryLayerNode.on('message', () => { totalReceived += 1 })
                discoveryLayerNodes.push(layer1)
                contentDeliveryLayerNodes.push(contentDeliveryLayerNode)
            })
        }))
    }, 45000)

    afterEach(async () => {
        await Promise.all(contentDeliveryLayerNodes.map((node) => node.stop()))
        await Promise.all(discoveryLayerNodes.map((node) => node.stop()))
    })

    it('All nodes receive messages', async () => {
        await waitForCondition(
            () => contentDeliveryLayerNodes.every((node) => node.getNeighbors().length >= 3), 30000
        )
        await waitForCondition(() => {
            const avg = contentDeliveryLayerNodes.reduce((acc, curr) => {
                return acc + curr.getNeighbors().length
            }, 0) / contentDeliveryLayerNodes.length
            return avg >= 4
        }, 20000)
        const msg = createStreamMessage(
            JSON.stringify({ hello: 'WORLD' }),
            STREAM_PART_ID,
            randomUserIdOld()
        )
        contentDeliveryLayerNodes[0].broadcast(msg)
        await waitForCondition(() => totalReceived >= NUM_OF_NODES, 10000)
    }, 45000)
})
