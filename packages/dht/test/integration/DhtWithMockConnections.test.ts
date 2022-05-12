import { DhtNode } from '../../src/dht/DhtNode'
import { PeerDescriptor } from '../../src/proto/DhtRpc'
import { createMockConnectionDhtNode } from '../utils'

describe('Mock Connection DHT Joining', () => {
    let entryPoint: DhtNode
    let nodes: DhtNode[]
    let entrypointDescriptor: PeerDescriptor

    beforeEach(async () => {
       
        nodes = []
        const entryPointId = '0'
        entryPoint = await createMockConnectionDhtNode(entryPointId)
        
        entrypointDescriptor = {
            peerId: entryPoint.getNodeId().value,
            type: 0
        }
       
        for (let i = 1; i < 100; i++) {
            const nodeId = `${i}`
            const node = await createMockConnectionDhtNode(nodeId)
            nodes.push(node)
        }
    })

    afterEach(async () => {
        await Promise.all([
            entryPoint.stop(),
            ...nodes.map(async (node) => await node.stop())
        ])
    })

    it ('Happy path', async () => {
        await entryPoint.joinDht(entrypointDescriptor)
        await Promise.allSettled(
            nodes.map((node) => node.joinDht(entrypointDescriptor))
        )
        nodes.forEach((node) => {
            expect(node.getBucketSize()).toBeGreaterThanOrEqual(node.getK())
            expect(node.getNeighborList().getSize()).toBeGreaterThanOrEqual(node.getK() * 2)
        })
        expect(entryPoint.getBucketSize()).toBeGreaterThanOrEqual(entryPoint.getK())
    })
})