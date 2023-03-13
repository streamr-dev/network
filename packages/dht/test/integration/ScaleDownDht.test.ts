import { LatencyType, Simulator } from '../../src/connection/Simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockConnectionDhtNode, waitConnectionManagersReadyForTesting } from '../utils'
import { isSamePeerDescriptor } from '../../src/helpers/peerIdFromPeerDescriptor'
import { waitForCondition } from '@streamr/utils'

describe('Scaling down a Dht network', () => {
    let entryPoint: DhtNode
    let nodes: DhtNode[]
    let entrypointDescriptor: PeerDescriptor
    const simulator = new Simulator(LatencyType.RANDOM)
    const NUM_NODES = 32
    const MAX_CONNECTIONS = 18
    const K = 2

    const nodesById: Map<string, DhtNode> = new Map()

    beforeEach(async () => {
        nodes = []
        const entryPointId = '0'
        entryPoint = await createMockConnectionDhtNode(entryPointId, simulator,
            undefined, K, entryPointId, MAX_CONNECTIONS)
        nodes.push(entryPoint)
        nodesById.set(entryPoint.getNodeId().toKey(), entryPoint)

        entrypointDescriptor = {
            kademliaId: entryPoint.getNodeId().value,
            type: NodeType.NODEJS,
            nodeName: entryPointId
        }

        nodes.push(entryPoint)

        for (let i = 1; i < NUM_NODES; i++) {
            const nodeId = `${i}`
            const node = await createMockConnectionDhtNode(nodeId, simulator, undefined, K, nodeId, MAX_CONNECTIONS)
            nodesById.set(node.getNodeId().toKey(), node)
            nodes.push(node)
        }
        await Promise.all(nodes.map((node) => node.joinDht(entrypointDescriptor)))
        await waitConnectionManagersReadyForTesting(nodes.map((node) => node.connectionManager!), MAX_CONNECTIONS)
    }, 60000)

    afterEach(async () => {
        await Promise.all(nodes.map(async (node) => await node.stop()))
    })

    it('Remaining nodes cleaned up stopped nodes from states', async () => {

        const randomIndices = []
        for (let i = 1; i < nodes.length; i++) {
            randomIndices.push(i)
        }
        let badMkay = 0

        while (randomIndices.length > 1) {
            const index = Math.floor(Math.random() * randomIndices.length)
            const nodeIndex = randomIndices[index]
            randomIndices.splice(index, 1)
            const stoppingPeerDescriptor = nodes[nodeIndex].getPeerDescriptor()
            console.log("STOPPING", nodes[nodeIndex].getNodeId().toString())
            await nodes[nodeIndex].stop()
            // await waitForCondition(() =>
            nodes.forEach((node) =>
                node.getAllConnectionPeerDescriptors().forEach((peer) => {
                    if (isSamePeerDescriptor(peer, stoppingPeerDescriptor)) {
                        badMkay += 1
                    }
                })
            )
            // )
        }
        expect(badMkay).toEqual(0)
    }, 180000)
})