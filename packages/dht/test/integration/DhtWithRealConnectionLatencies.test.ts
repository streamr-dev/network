import { DhtNode } from '../../src/dht/DhtNode'
import { createMockConnectionDhtNode } from '../utils/utils'
import { LatencyType, Simulator } from '../../src/connection/Simulator/Simulator'
import { PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { getRandomRegion } from '../../src/connection/Simulator/pings'

describe('Mock connection Dht joining with real latencies', () => {
    let entryPoint: DhtNode
    let nodes: DhtNode[]
    let simulator: Simulator
    Simulator.useFakeTimers()
    let entrypointDescriptor: PeerDescriptor
    
    beforeEach(async () => {
        nodes = []
        simulator = new Simulator(LatencyType.REAL)
        const entryPointId = '0'
        entryPoint = await createMockConnectionDhtNode(entryPointId, simulator)
        entrypointDescriptor = {
            kademliaId: entryPoint.getNodeId().value,
            type: 0,
            region: getRandomRegion()
        }
        for (let i = 1; i < 100; i++) {
            const nodeId = `${i}`
            const node = await createMockConnectionDhtNode(nodeId, simulator)
            nodes.push(node)
        }
    })

    afterEach(async () => {
        await Promise.all([
            entryPoint.stop(),
            ...nodes.map((node) => node.stop())
        ])
        simulator.stop()
    })

    it('Happy path', async () => {
        await entryPoint.joinDht(entrypointDescriptor)
        await Promise.all(nodes.map((node) => node.joinDht(entrypointDescriptor)))
        nodes.forEach((node) => {
            expect(node.getBucketSize()).toBeGreaterThanOrEqual(node.getK() - 3)
            expect(node.getNeighborList().getSize()).toBeGreaterThanOrEqual(node.getK() - 3)
        })
        expect(entryPoint.getBucketSize()).toBeGreaterThanOrEqual(entryPoint.getK())
    }, 60 * 1000)
})
