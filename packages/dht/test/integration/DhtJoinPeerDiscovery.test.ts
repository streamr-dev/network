import { getTestInterface } from '@streamr/test-utils'
import { LatencyType, Simulator } from '../../src/connection/Simulator/Simulator'
import { getRandomRegion } from '../../src/connection/Simulator/pings'
import { DhtNode } from '../../src/dht/DhtNode'
import { NodeType } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockConnectionDhtNode } from '../utils/utils'

const runTest = async (latencyType: LatencyType) => {
    const simulator = new Simulator(latencyType)
    const entryPointId = '0'
    const entryPoint = await createMockConnectionDhtNode(entryPointId, simulator)
    const entrypointDescriptor = {
        kademliaId: entryPoint.getNodeId().value,
        type: NodeType.NODEJS,
        region: getRandomRegion()
    }
    const nodes: DhtNode[] = []
    for (let i = 1; i < 100; i++) {
        const nodeId = `${i}`
        const node = await createMockConnectionDhtNode(nodeId, simulator)
        nodes.push(node)
    }

    await entryPoint.joinDht([entrypointDescriptor])
    await Promise.all(nodes.map((node) => node.joinDht([entrypointDescriptor])))
    nodes.forEach((node) => {
        expect(getTestInterface(node).getBucketSize()).toBeGreaterThanOrEqual(node.getK() / 2)
        expect(node.getClosestContacts().length).toBeGreaterThanOrEqual(node.getK() / 2)
    })
    expect(getTestInterface(entryPoint).getBucketSize()).toBeGreaterThanOrEqual(entryPoint.getK() / 2)

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
