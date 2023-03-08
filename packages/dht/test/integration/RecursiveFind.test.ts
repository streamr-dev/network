import { LatencyType, Simulator } from '../../src/connection/Simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockConnectionDhtNode, waitConnectionManagersReadyForTesting } from '../utils'
import { PeerID, peerIdFromPeerDescriptor } from '../../src/exports'

describe('Recursive find correctness', () => {

    let entryPoint: DhtNode
    let nodes: DhtNode[]
    let entrypointDescriptor: PeerDescriptor
    const simulator = new Simulator(LatencyType.RANDOM)
    const NUM_NODES = 100
    const K = 2

    beforeEach(async () => {
        nodes = []
        const entryPointId = '0'
        entryPoint = await createMockConnectionDhtNode(entryPointId, simulator, undefined, K, entryPointId)
        nodes.push(entryPoint)
        entrypointDescriptor = {
            kademliaId: entryPoint.getNodeId().value,
            type: NodeType.NODEJS,
            nodeName: entryPointId
        }
        for (let i = 1; i < NUM_NODES; i++) {
            const nodeId = `${i}`
            const node = await createMockConnectionDhtNode(nodeId, simulator, undefined, K, nodeId)
            nodes.push(node)
        }
        await entryPoint.joinDht(entrypointDescriptor)
        await Promise.all(nodes.map((node) => node.joinDht(entrypointDescriptor)))
        await waitConnectionManagersReadyForTesting(nodes.map((node) => node.connectionManager!), 20)
    }, 90000)

    afterEach(async () => {
        await Promise.all([
            entryPoint.stop(),
            ...nodes.map(async (node) => await node.stop())
        ])
    })

    it('Entrypoint can find a node from the network (exact match)', async () => {
        const kademliaIdToFind = nodes[45].getNodeId().value
        const results = await entryPoint.startRecursiveFind(kademliaIdToFind)
        expect(results.closestNodes.length).toBeGreaterThanOrEqual(5)
        expect(PeerID.fromValue(kademliaIdToFind).equals(peerIdFromPeerDescriptor(results.closestNodes[0])))
    }, 30000)

})
