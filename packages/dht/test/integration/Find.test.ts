import { LatencyType, Simulator } from '../../src/connection/simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
import { createMockConnectionDhtNode, waitForStableTopology } from '../utils/utils'
import { toDhtAddress, toNodeId, toDhtAddressRaw } from '../../src/identifiers'

const NUM_NODES = 100
const K = 8

describe('Find correctness', () => {
    let entryPoint: DhtNode
    let nodes: DhtNode[]
    let entrypointDescriptor: PeerDescriptor
    const simulator = new Simulator(LatencyType.REAL)

    beforeEach(async () => {
        nodes = []
        entryPoint = await createMockConnectionDhtNode(simulator, undefined, K)
        nodes.push(entryPoint)
        entrypointDescriptor = entryPoint.getLocalPeerDescriptor()
        for (let i = 1; i < NUM_NODES; i++) {
            const node = await createMockConnectionDhtNode(simulator, undefined, K, 15, 60000)
            nodes.push(node)
        }
        await entryPoint.joinDht([entrypointDescriptor])
        await Promise.all(nodes.map((node) => node.joinDht([entrypointDescriptor])))
        await waitForStableTopology(nodes, 15, 45 * 1000)
    }, 90000)

    afterEach(async () => {
        await Promise.all([entryPoint.stop(), ...nodes.map(async (node) => await node.stop())])
    })

    it('Entrypoint can find a node from the network (exact match)', async () => {
        const targetId = toDhtAddressRaw(nodes[45].getNodeId())
        const closestNodes = await entryPoint.findClosestNodesFromDht(toDhtAddress(targetId))
        expect(closestNodes.length).toBeGreaterThanOrEqual(5)
        expect(toDhtAddress(targetId)).toEqual(toNodeId(closestNodes[0]))
    }, 90000)
})
