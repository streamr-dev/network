import { DhtNode } from '../../src/dht/DhtNode'
import { createMockConnectionDhtNode } from '../utils'
import { LatencyType, Simulator } from '../../src/connection/Simulator/Simulator'
import { PeerDescriptor } from '../../src/proto/DhtRpc'
import { getRandomRegion } from '../data/pings'

describe('Mock connection Dht joining with real latencies', () => {
    let entryPoint: DhtNode
    let nodes: DhtNode[]
    const simulator = new Simulator(LatencyType.REAL)
    let entrypointDescriptor: PeerDescriptor
    
    beforeEach(async () => {
        nodes = []

        const entryPointId = '0'
        entryPoint = await createMockConnectionDhtNode(entryPointId, simulator)
       
        entrypointDescriptor = {
            peerId: entryPoint.getNodeId().value,
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
            ...nodes.map(async (node) => await node.stop())
        ])
    })

    it('Happy path', async () => {
        await entryPoint.joinDht(entrypointDescriptor)
        await Promise.allSettled(
            nodes.map((node) => node.joinDht(entrypointDescriptor))
        )
        nodes.forEach((node) => {
            expect(node.getBucketSize()).toBeGreaterThanOrEqual(node.getK() - 1)
            expect(node.getNeighborList().getSize()).toBeGreaterThanOrEqual(node.getK() * 2)
        })
        expect(entryPoint.getBucketSize()).toBeGreaterThanOrEqual(entryPoint.getK())
    }, 60 * 1000)
})
