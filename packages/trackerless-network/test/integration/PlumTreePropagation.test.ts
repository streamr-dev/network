import { LatencyType, Simulator } from '@streamr/dht'
import { StreamPartIDUtils, until } from '@streamr/utils'
import range from 'lodash/range'
import { ContentDeliveryLayerNode } from '../../src/content-delivery-layer/ContentDeliveryLayerNode'
import { DiscoveryLayerNode } from '../../src/discovery-layer/DiscoveryLayerNode'
import { createMockContentDeliveryLayerNodeAndDhtNode, createMockPeerDescriptor, createStreamMessage } from '../utils/utils'
import { randomUserId } from '@streamr/test-utils'
import crypto from 'crypto'

describe('Propagation', () => {
    const entryPointDescriptor = createMockPeerDescriptor()
    let discoveryLayerNodes: DiscoveryLayerNode[]
    let contentDeliveryLayerNodes: ContentDeliveryLayerNode[]
    const STREAM_PART_ID = StreamPartIDUtils.parse('testingtesting#0')
    let totalReceived: number
    const INITIAL_NODE_COUNT = 16
    const NEW_NODE_COUNT = 16
    const MAX_PAUSED_NEIGHBORS = 2
    let simulator: Simulator
    const NEIGHBOR_MIN = 4
    const WAIT_NEIGHBORS_MS = 20000
    const WAIT_DELIVERY_MS = 10000
    const LARGE_HEX_BYTES = 30000

    const waitForStableNeighbors = async (): Promise<void> => {
        await until(
            () => contentDeliveryLayerNodes.every((node) => node.getNeighbors().length >= NEIGHBOR_MIN),
            WAIT_NEIGHBORS_MS
        )
    }

    const addNodeAndJoin = async (descriptor = createMockPeerDescriptor()): Promise<void> => {
        const [discoveryNode, contentNode] = await createMockContentDeliveryLayerNodeAndDhtNode(
            descriptor,
            entryPointDescriptor,
            STREAM_PART_ID,
            simulator,
            true,
            MAX_PAUSED_NEIGHBORS
        )
        await discoveryNode.start()
        await contentNode.start()
        await discoveryNode.joinDht([entryPointDescriptor])
        contentNode.on('message', () => {
            totalReceived += 1
        })
        discoveryLayerNodes.push(discoveryNode)
        contentDeliveryLayerNodes.push(contentNode)
    }

    beforeEach(async () => {
        simulator = new Simulator(LatencyType.REAL)
        totalReceived = 0
        discoveryLayerNodes = []
        contentDeliveryLayerNodes = []
        const [entryPoint, node1] = await createMockContentDeliveryLayerNodeAndDhtNode(
            entryPointDescriptor,
            entryPointDescriptor,
            STREAM_PART_ID,
            simulator,
            true,
            MAX_PAUSED_NEIGHBORS
        )
        await entryPoint.start()
        await entryPoint.joinDht([entryPointDescriptor])
        await node1.start()
        node1.on('message', () => {
            totalReceived += 1
        })
        discoveryLayerNodes.push(entryPoint)
        contentDeliveryLayerNodes.push(node1)

        await Promise.all(range(INITIAL_NODE_COUNT).map(async () => addNodeAndJoin()))
    }, 45000)

    afterEach(async () => {
        await Promise.all(contentDeliveryLayerNodes.map((node) => node.stop()))
        await Promise.all(discoveryLayerNodes.map((node) => node.stop()))
        simulator.stop()
    })

    it('All nodes receive messages', async () => {
        await waitForStableNeighbors()

        const numberOfPublishedMessages = 25
        const publisher = randomUserId()
        for (let i = 1; i < numberOfPublishedMessages; i++) {
            const msg = createStreamMessage(
                JSON.stringify({ hello: crypto.randomBytes(LARGE_HEX_BYTES).toString('hex') }),
                STREAM_PART_ID,
                publisher
            )
            contentDeliveryLayerNodes[0].broadcast(msg)
            await until(() => totalReceived >= INITIAL_NODE_COUNT * i, WAIT_DELIVERY_MS)
        }
    }, 90000)

    it('Works after new nodes join', async () => {
        await waitForStableNeighbors()

        const publisher = randomUserId()
        for (let i = 1; i < 5; i++) {
            const msg = createStreamMessage(
                JSON.stringify({ hello: 'WORLD' }),
                STREAM_PART_ID,
                publisher
            )
            contentDeliveryLayerNodes[0].broadcast(msg)
            await until(() => totalReceived >= INITIAL_NODE_COUNT * i, WAIT_DELIVERY_MS)
        }
        totalReceived = 0

        await Promise.all(range(NEW_NODE_COUNT).map(async () => addNodeAndJoin()))
        for (let i = 1; i < 5; i++) {
            const msg = createStreamMessage(
                JSON.stringify({ hello: 'WORLD' }),
                STREAM_PART_ID,
                publisher
            )
            contentDeliveryLayerNodes[0].broadcast(msg)
            await until(() => totalReceived >= (INITIAL_NODE_COUNT + NEW_NODE_COUNT) * i, WAIT_DELIVERY_MS)
        }
    }, 90000)

    it('Multiple publishers', async () => {
        await waitForStableNeighbors()

        const publisher1 = randomUserId()
        for (let i = 1; i < 5; i++) {
            const msg = createStreamMessage(
                JSON.stringify({ hello: 'WORLD' }),
                STREAM_PART_ID,
                publisher1
            )
            contentDeliveryLayerNodes[0].broadcast(msg)
            await until(() => totalReceived >= INITIAL_NODE_COUNT * i, WAIT_DELIVERY_MS)
        }
        totalReceived = 0
        const publisher2 = randomUserId()
        for (let i = 1; i < 5; i++) {
            const msg = createStreamMessage(
                JSON.stringify({ hello: 'WORLD' }),
                STREAM_PART_ID,
                publisher2
            )
            contentDeliveryLayerNodes[0].broadcast(msg)
            await until(() => totalReceived >= INITIAL_NODE_COUNT * i, WAIT_DELIVERY_MS)
        }
    }, 30000)
})
