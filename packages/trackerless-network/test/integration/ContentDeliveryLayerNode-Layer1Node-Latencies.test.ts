import { DhtNode, LatencyType, PeerDescriptor, Simulator, SimulatorTransport, getNodeIdFromPeerDescriptor } from '@streamr/dht'
import { waitForCondition } from '@streamr/utils'
import { range } from 'lodash'
import { ContentDeliveryLayerNode } from '../../src/logic/ContentDeliveryLayerNode'
import { createContentDeliveryLayerNode } from '../../src/logic/createContentDeliveryLayerNode'
import { createMockPeerDescriptor } from '../utils/utils'
import { StreamPartIDUtils } from '@streamr/protocol'
import { Layer1Node } from '../../src/logic/Layer1Node'

describe('ContentDeliveryLayerNode-DhtNode-Latencies', () => {
    const otherNodeCount = 64
    let otherLayer1Nodes: Layer1Node[]
    let entryPointLayer1Node: Layer1Node
    let entryPointContentDeliveryLayerNode: ContentDeliveryLayerNode
    let otherContentDeliveryLayerNodes: ContentDeliveryLayerNode[]

    const streamPartId = StreamPartIDUtils.parse('stream#0')
    const entrypointDescriptor = createMockPeerDescriptor()

    const peerDescriptors: PeerDescriptor[] = range(otherNodeCount).map(() => createMockPeerDescriptor())
    beforeEach(async () => {
        const simulator = new Simulator(LatencyType.FIXED, 50)
        const entrypointCm = new SimulatorTransport(entrypointDescriptor, simulator)
        const cms: SimulatorTransport[] = range(otherNodeCount).map((i) =>
            new SimulatorTransport(peerDescriptors[i], simulator)
        )
        await entrypointCm.start()
        await Promise.all(cms.map((cm) => cm.start()))

        entryPointLayer1Node = new DhtNode({
            transport: entrypointCm,
            connectionsView: entrypointCm,
            peerDescriptor: entrypointDescriptor,
            serviceId: streamPartId
        })
        otherLayer1Nodes = range(otherNodeCount).map((i) => new DhtNode({
            transport: cms[i],
            connectionsView: cms[i],
            peerDescriptor: peerDescriptors[i],
            serviceId: streamPartId
        }))
        otherContentDeliveryLayerNodes = range(otherNodeCount).map((i) => createContentDeliveryLayerNode({
            streamPartId,
            layer1Node: otherLayer1Nodes[i],
            transport: cms[i],
            connectionLocker: cms[i],
            localPeerDescriptor: peerDescriptors[i],
            isLocalNodeEntryPoint: () => false
        }))
        entryPointContentDeliveryLayerNode = createContentDeliveryLayerNode({
            streamPartId,
            layer1Node: entryPointLayer1Node,
            transport: entrypointCm,
            connectionLocker: entrypointCm,
            localPeerDescriptor: entrypointDescriptor,
            isLocalNodeEntryPoint: () => false
        })

        await entryPointLayer1Node.start()
        entryPointContentDeliveryLayerNode.start()
        await entryPointLayer1Node.joinDht([entrypointDescriptor])
        await Promise.all(otherLayer1Nodes.map((node) => node.start()))
    })

    afterEach(async () => {
        entryPointLayer1Node.stop()
        entryPointContentDeliveryLayerNode.stop()
        await Promise.all(otherLayer1Nodes.map((node) => node.stop()))
        await Promise.all(otherContentDeliveryLayerNodes.map((node) => node.stop()))
    })

    it('happy path single node', async () => {
        await otherContentDeliveryLayerNodes[0].start()
        await otherLayer1Nodes[0].joinDht([entrypointDescriptor])
        await Promise.all([
            waitForCondition(() => otherContentDeliveryLayerNodes[0].getNearbyNodeView().getIds().length === 1),
            waitForCondition(() => otherContentDeliveryLayerNodes[0].getNeighbors().length === 1)
        ])
        expect(otherContentDeliveryLayerNodes[0].getNearbyNodeView().getIds().length).toEqual(1)
        expect(otherContentDeliveryLayerNodes[0].getNeighbors().length).toEqual(1)
    })

    it('happy path 5 nodes', async () => {
        range(4).forEach((i) => otherContentDeliveryLayerNodes[i].start())
        await Promise.all(range(4).map(async (i) => {
            await otherLayer1Nodes[i].joinDht([entrypointDescriptor])
        }))
        await waitForCondition(() => range(4).every((i) => otherContentDeliveryLayerNodes[i].getNeighbors().length >= 4), 15000, 1000)
        range(4).forEach((i) => {
            expect(otherContentDeliveryLayerNodes[i].getNearbyNodeView().getIds().length).toBeGreaterThanOrEqual(4)
            expect(otherContentDeliveryLayerNodes[i].getNeighbors().length).toBeGreaterThanOrEqual(4)
        })
        // Check bidirectionality
        const allNodes = otherContentDeliveryLayerNodes
        allNodes.push(entryPointContentDeliveryLayerNode)
        range(5).forEach((i) => {
            const ownNodeId = allNodes[i].getOwnNodeId()
            allNodes[i].getNearbyNodeView().getIds().forEach((nodeId) => {
                const neighbor = allNodes.find((node) => {
                    return node.getOwnNodeId() === ownNodeId
                })
                const neighborIds = neighbor!.getNeighbors().map((n) => getNodeIdFromPeerDescriptor(n))
                expect(neighborIds).toContain(nodeId)
            })
        })
    }, 60000)

    it('happy path 64 nodes', async () => {
        await Promise.all(range(otherNodeCount).map((i) => otherContentDeliveryLayerNodes[i].start()))
        await Promise.all(range(otherNodeCount).map((i) => {
            otherLayer1Nodes[i].joinDht([entrypointDescriptor])
        }))
        await Promise.all(otherContentDeliveryLayerNodes.map((node) =>
            waitForCondition(() => node.getNeighbors().length >= 4, 10000)
        ))

        await Promise.all(otherContentDeliveryLayerNodes.map((node) =>
            waitForCondition(() => node.getOutgoingHandshakeCount() === 0)
        ))

        await waitForCondition(() => {
            let mismatchCounter = 0
            otherContentDeliveryLayerNodes.forEach((node) => {
                const nodeId = node.getOwnNodeId()
                node.getNeighbors().forEach((neighbor) => {
                    const neighborId = getNodeIdFromPeerDescriptor(neighbor)
                    if (neighborId !== entryPointContentDeliveryLayerNode.getOwnNodeId()) {
                        const neighbor = otherContentDeliveryLayerNodes.find((n) => n.getOwnNodeId() === neighborId)
                        const neighborIds = neighbor!.getNeighbors().map((n) => getNodeIdFromPeerDescriptor(n))
                        if (!neighborIds.includes(nodeId)) {
                            mismatchCounter += 1
                        }
                    }
                })
            })
            // NET-1074 Investigate why sometimes unidirectional connections remain.
            return mismatchCounter <= 2
        }, 20000, 1000)
    }, 90000)
})
