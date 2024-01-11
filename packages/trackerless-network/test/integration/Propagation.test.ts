import { Simulator } from '@streamr/dht'
import { StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { waitForCondition } from '@streamr/utils'
import { range } from 'lodash'
import { RandomGraphNode } from '../../src/logic/RandomGraphNode'
import { createMockPeerDescriptor, createMockRandomGraphNodeAndDhtNode, createStreamMessage } from '../utils/utils'
import { Layer1Node } from '../../src/logic/Layer1Node'

describe('Propagation', () => {
    const entryPointDescriptor = createMockPeerDescriptor()
    let layer1Nodes: Layer1Node[]
    let randomGraphNodes: RandomGraphNode[]
    const STREAM_PART_ID = StreamPartIDUtils.parse('testingtesting#0')
    let totalReceived: number
    const NUM_OF_NODES = 256
    let simulator: Simulator

    beforeEach(async () => {
        simulator = new Simulator()
        totalReceived = 0
        layer1Nodes = []
        randomGraphNodes = []
        const [entryPoint, node1] = await createMockRandomGraphNodeAndDhtNode(entryPointDescriptor, entryPointDescriptor, STREAM_PART_ID, simulator)
        await entryPoint.start()
        await entryPoint.joinDht([entryPointDescriptor])
        await node1.start()
        node1.on('message', () => {totalReceived += 1})
        layer1Nodes.push(entryPoint)
        randomGraphNodes.push(node1)

        await Promise.all(range(NUM_OF_NODES).map(async (_i) => {
            const descriptor = createMockPeerDescriptor()
            const [layer1, randomGraphNode] = await createMockRandomGraphNodeAndDhtNode(
                descriptor,
                entryPointDescriptor,
                STREAM_PART_ID,
                simulator
            )
            await layer1.start()
            await randomGraphNode.start()
            // eslint-disable-next-line promise/always-return
            await layer1.joinDht([entryPointDescriptor]).then(() => {
                randomGraphNode.on('message', () => { totalReceived += 1 })
                layer1Nodes.push(layer1)
                randomGraphNodes.push(randomGraphNode)
            })
        }))
    }, 45000)

    afterEach(async () => {
        await Promise.all(randomGraphNodes.map((node) => node.stop()))
        await Promise.all(layer1Nodes.map((node) => node.stop()))
        simulator.stop()
    })

    it('All nodes receive messages', async () => {
        await waitForCondition(
            () => randomGraphNodes.every((node) => node.getNeighborIds().length >= 3), 30000
        )
        await waitForCondition(() => {
            const avg = randomGraphNodes.reduce((acc, curr) => {
                return acc + curr.getNeighborIds().length
            }, 0) / randomGraphNodes.length
            return avg >= 4
        }, 20000)
        const msg = createStreamMessage(
            JSON.stringify({ hello: 'WORLD' }),
            STREAM_PART_ID,
            randomEthereumAddress()
        )
        randomGraphNodes[0].broadcast(msg)
        await waitForCondition(() => totalReceived >= NUM_OF_NODES, 10000)
    }, 45000)
})
