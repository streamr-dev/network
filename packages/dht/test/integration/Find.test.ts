import { LatencyType, Simulator } from '../../src/connection/simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockConnectionDhtNode, waitForStableTopology } from '../utils/utils'
import { getDhtAddressFromRaw, getNodeIdFromPeerDescriptor, getRawFromDhtAddress } from '../../src/identifiers'

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
            const node = await createMockConnectionDhtNode(simulator, undefined, K, 40, 60000)
            nodes.push(node)
        }
        await entryPoint.joinDht([entrypointDescriptor])
        await Promise.all(nodes.map((node) => node.joinDht([entrypointDescriptor])))
        await waitForStableTopology(nodes, 20)
    }, 90000)

    afterEach(async () => {
        await Promise.all([
            entryPoint.stop(),
            ...nodes.map(async (node) => await node.stop())
        ])
    })

    it('Entrypoint can find a node from the network (exact match)', async () => {
        const targetId = getRawFromDhtAddress(nodes[45].getNodeId())
        const closestNodes = await entryPoint.findClosestNodesFromDht(getDhtAddressFromRaw(targetId))
        expect(closestNodes.length).toBeGreaterThanOrEqual(5)
        expect(getDhtAddressFromRaw(targetId)).toEqual(getNodeIdFromPeerDescriptor(closestNodes[0]))
    }, 30000)

})
