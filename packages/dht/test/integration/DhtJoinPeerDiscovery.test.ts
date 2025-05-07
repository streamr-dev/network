import { LatencyType, Simulator } from '../../src/connection/simulator/Simulator'
import { getRandomRegion } from '../../src/connection/simulator/pings'
import { DhtNode, NUMBER_OF_NODES_PER_KBUCKET_DEFAULT } from '../../src/dht/DhtNode'
import { toDhtAddress } from '../../src/identifiers'
import { createMockConnectionDhtNode, createMockPeerDescriptor } from '../utils/utils'

const runTest = async (latencyType: LatencyType) => {
    const simulator = new Simulator(latencyType)
    const entrypointDescriptor = createMockPeerDescriptor({
        region: getRandomRegion()
    })
    const entryPoint = await createMockConnectionDhtNode(simulator, toDhtAddress(entrypointDescriptor.nodeId))
    const nodes: DhtNode[] = []
    for (let i = 1; i < 100; i++) {
        const node = await createMockConnectionDhtNode(simulator, undefined)
        nodes.push(node)
    }

    await entryPoint.joinDht([entrypointDescriptor])
    await Promise.all(nodes.map((node) => node.joinDht([entrypointDescriptor])))
    nodes.forEach((node) => {
        expect(node.getNeighborCount()).toBeGreaterThanOrEqual(NUMBER_OF_NODES_PER_KBUCKET_DEFAULT / 2)
        expect(node.getClosestContacts().length).toBeGreaterThanOrEqual(NUMBER_OF_NODES_PER_KBUCKET_DEFAULT / 2)
    })
    expect(entryPoint.getNeighborCount()).toBeGreaterThanOrEqual(NUMBER_OF_NODES_PER_KBUCKET_DEFAULT / 2)

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
