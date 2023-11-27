import { LatencyType, Simulator } from '../../src/connection/simulator/Simulator'
import { getRandomRegion } from '../../src/connection/simulator/pings'
import { DhtNode } from '../../src/dht/DhtNode'
import { NodeType } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockConnectionDhtNode } from '../utils/utils'

const NUM_OF_NODES_PER_KBUCKET = 8

const runTest = async (latencyType: LatencyType) => {
    const simulator = new Simulator(latencyType)
    const entryPointId = '0'
    const entryPoint = await createMockConnectionDhtNode(entryPointId, simulator, undefined, NUM_OF_NODES_PER_KBUCKET)
    const entrypointDescriptor = {
        nodeId: entryPoint.getNodeId().value,
        type: NodeType.NODEJS,
        region: getRandomRegion()
    }
    const nodes: DhtNode[] = []
    for (let i = 1; i < 100; i++) {
        const nodeId = `${i}`
        const node = await createMockConnectionDhtNode(nodeId, simulator, undefined, NUM_OF_NODES_PER_KBUCKET)
        nodes.push(node)
    }

    await entryPoint.joinDht([entrypointDescriptor])
    await Promise.all(nodes.map((node) => node.joinDht([entrypointDescriptor])))
    nodes.forEach((node) => {
        expect(node.getBucketSize()).toBeGreaterThanOrEqual(NUM_OF_NODES_PER_KBUCKET / 2)
        expect(node.getClosestContacts().length).toBeGreaterThanOrEqual(NUM_OF_NODES_PER_KBUCKET / 2)
    })
    expect(entryPoint.getBucketSize()).toBeGreaterThanOrEqual(NUM_OF_NODES_PER_KBUCKET / 2)

    await Promise.all([
        entryPoint.stop(),
        ...nodes.map((node) => node.stop())
    ])
    simulator.stop()
}

describe('DhtJoinPeerDiscovery', () => {
    
    it('latency: none', async () => {
        await runTest(LatencyType.NONE)
    }, 60 * 1000)

    it('latency: random', async () => {
        await runTest(LatencyType.RANDOM)
    }, 60 * 1000)

    it('latency: real', async () => {
        await runTest(LatencyType.REAL)
    }, 60 * 1000)
})
