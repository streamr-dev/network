import { LatencyType, Simulator } from '../../src/connection/simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { PeerDescriptor, RecursiveOperation } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockConnectionDhtNode, waitConnectionManagersReadyForTesting } from '../utils/utils'
import { PeerID } from '../../src/helpers/PeerID'
import { peerIdFromPeerDescriptor } from '../../src/helpers/peerIdFromPeerDescriptor'
import { hexToBinary } from '@streamr/utils'

describe('Find correctness', () => {

    let entryPoint: DhtNode
    let nodes: DhtNode[]
    let entrypointDescriptor: PeerDescriptor
    const simulator = new Simulator(LatencyType.REAL)
    const NUM_NODES = 100
    const K = 2

    beforeEach(async () => {
        nodes = []
        const entryPointId = '0'
        entryPoint = await createMockConnectionDhtNode(entryPointId, simulator, undefined, K)
        nodes.push(entryPoint)
        entrypointDescriptor = entryPoint.getLocalPeerDescriptor()
        for (let i = 1; i < NUM_NODES; i++) {
            const nodeId = `${i}`
            const node = await createMockConnectionDhtNode(nodeId, simulator, undefined, K, 20, 60000)
            nodes.push(node)
        }
        await entryPoint.joinDht([entrypointDescriptor])
        await Promise.all(nodes.map((node) => node.joinDht([entrypointDescriptor])))
        await waitConnectionManagersReadyForTesting(nodes.map((node) => node.connectionManager!), 20)
    }, 90000)

    afterEach(async () => {
        await Promise.all([
            entryPoint.stop(),
            ...nodes.map(async (node) => await node.stop())
        ])
    })

    it('Entrypoint can find a node from the network (exact match)', async () => {
        const targetId = hexToBinary(nodes[45].getNodeId())
        const results = await entryPoint.executeRecursiveOperation(targetId, RecursiveOperation.FIND_NODE)
        expect(results.closestNodes.length).toBeGreaterThanOrEqual(5)
        expect(PeerID.fromValue(targetId).equals(peerIdFromPeerDescriptor(results.closestNodes[0])))
    }, 30000)

})
