import {
    ConnectionManager,
    DhtNode,
    PeerDescriptor,
    Simulator,
    SimulatorTransport,
    toNodeId,
    getRandomRegion
} from '@streamr/dht'
import { Logger, StreamPartIDUtils, until } from '@streamr/utils'
import { range } from 'lodash'
import { ContentDeliveryLayerNode } from '../../src/logic/ContentDeliveryLayerNode'
import { DiscoveryLayerNode } from '../../src/logic/DiscoveryLayerNode'
import { createContentDeliveryLayerNode } from '../../src/logic/createContentDeliveryLayerNode'
import { createMockPeerDescriptor } from '../utils/utils'

const logger = new Logger(module)

describe('ContentDeliveryLayerNode-DhtNode', () => {
    const otherNodeCount = 64
    let entryPointDiscoveryLayerNode: DiscoveryLayerNode
    let otherDiscoveryLayerNodes: DiscoveryLayerNode[]
    let entryPointContentDeliveryLayerNode: ContentDeliveryLayerNode
    let otherContentDeliveryLayerNodes: ContentDeliveryLayerNode[]

    const streamPartId = StreamPartIDUtils.parse('stream#0')
    const entrypointDescriptor = createMockPeerDescriptor({
        region: getRandomRegion()
    })

    const peerDescriptors: PeerDescriptor[] = range(otherNodeCount).map(() => {
        return createMockPeerDescriptor({
            region: getRandomRegion()
        })
    })
    beforeEach(async () => {
        const simulator = new Simulator()
        const entrypointCm = new SimulatorTransport(entrypointDescriptor, simulator)
        await entrypointCm.start()

        const cms: ConnectionManager[] = range(otherNodeCount).map(
            (i) => new SimulatorTransport(peerDescriptors[i], simulator)
        )
        await Promise.all(cms.map((cm) => cm.start()))

        entryPointDiscoveryLayerNode = new DhtNode({
            transport: entrypointCm,
            connectionsView: entrypointCm,
            peerDescriptor: entrypointDescriptor,
            serviceId: streamPartId
        })

        otherDiscoveryLayerNodes = range(otherNodeCount).map(
            (i) =>
                new DhtNode({
                    transport: cms[i],
                    connectionsView: cms[i],
                    peerDescriptor: peerDescriptors[i],
                    serviceId: streamPartId
                })
        )

        otherContentDeliveryLayerNodes = range(otherNodeCount).map((i) =>
            createContentDeliveryLayerNode({
                streamPartId,
                discoveryLayerNode: otherDiscoveryLayerNodes[i],
                transport: cms[i],
                connectionLocker: cms[i],
                localPeerDescriptor: peerDescriptors[i],
                neighborUpdateInterval: 2000,
                isLocalNodeEntryPoint: () => false
            })
        )

        entryPointContentDeliveryLayerNode = createContentDeliveryLayerNode({
            streamPartId,
            discoveryLayerNode: entryPointDiscoveryLayerNode,
            transport: entrypointCm,
            connectionLocker: entrypointCm,
            localPeerDescriptor: entrypointDescriptor,
            neighborUpdateInterval: 2000,
            isLocalNodeEntryPoint: () => false
        })

        await entryPointDiscoveryLayerNode.start()
        await entryPointContentDeliveryLayerNode.start()
        await entryPointDiscoveryLayerNode.joinDht([entrypointDescriptor])
        await Promise.all(otherDiscoveryLayerNodes.map((node) => node.start()))
    })

    afterEach(async () => {
        await entryPointDiscoveryLayerNode.stop()
        entryPointContentDeliveryLayerNode.stop()
        await Promise.all(otherDiscoveryLayerNodes.map((node) => node.stop()))
        await Promise.all(otherContentDeliveryLayerNodes.map((node) => node.stop()))
    })

    it('happy path single node ', async () => {
        await otherContentDeliveryLayerNodes[0].start()
        await otherDiscoveryLayerNodes[0].joinDht([entrypointDescriptor])

        await until(() => otherContentDeliveryLayerNodes[0].getNeighbors().length === 1)
        expect(otherContentDeliveryLayerNodes[0].getNearbyNodeView().getIds().length).toEqual(1)
        expect(otherContentDeliveryLayerNodes[0].getNeighbors().length).toEqual(1)
    })

    it('happy path 4 nodes', async () => {
        range(4).forEach((i) => otherContentDeliveryLayerNodes[i].start())
        await Promise.all(
            range(4).map(async (i) => {
                await otherDiscoveryLayerNodes[i].joinDht([entrypointDescriptor])
            })
        )

        await until(() => range(4).every((i) => otherContentDeliveryLayerNodes[i].getNeighbors().length === 4))
        range(4).forEach((i) => {
            expect(otherContentDeliveryLayerNodes[i].getNearbyNodeView().getIds().length).toBeGreaterThanOrEqual(4)
            expect(otherContentDeliveryLayerNodes[i].getNeighbors().length).toBeGreaterThanOrEqual(4)
        })

        // Check bidirectionality
        const allNodes = otherContentDeliveryLayerNodes
        allNodes.push(entryPointContentDeliveryLayerNode)
        range(5).forEach((i) => {
            allNodes[i]
                .getNearbyNodeView()
                .getIds()
                .forEach((nodeId) => {
                    const neighbor = allNodes.find((node) => {
                        return node.getOwnNodeId() === nodeId
                    })
                    const neighborNodeIds = neighbor!.getNeighbors().map((n) => toNodeId(n))
                    expect(neighborNodeIds.includes(allNodes[i].getOwnNodeId())).toEqual(true)
                })
        })
    }, 10000)

    it('happy path 64 nodes', async () => {
        await Promise.all(range(otherNodeCount).map((i) => otherContentDeliveryLayerNodes[i].start()))
        await Promise.all(
            range(otherNodeCount).map((i) => {
                otherDiscoveryLayerNodes[i].joinDht([entrypointDescriptor])
            })
        )
        await Promise.all(
            otherContentDeliveryLayerNodes.map((node) => until(() => node.getNeighbors().length >= 4, 10000))
        )

        const avg =
            otherContentDeliveryLayerNodes.reduce((acc, curr) => {
                return acc + curr.getNeighbors().length
            }, 0) / otherNodeCount

        logger.info(`AVG Number of neighbors: ${avg}`)
        await Promise.all(
            otherContentDeliveryLayerNodes.map((node) => until(() => node.getOutgoingHandshakeCount() === 0))
        )
        await until(
            () => {
                let mismatchCounter = 0
                otherContentDeliveryLayerNodes.forEach((node) => {
                    const nodeId = node.getOwnNodeId()
                    node.getNeighbors().forEach((neighbor) => {
                        const neighborId = toNodeId(neighbor)
                        if (neighborId !== entryPointContentDeliveryLayerNode.getOwnNodeId()) {
                            const neighbor = otherContentDeliveryLayerNodes.find((n) => n.getOwnNodeId() === neighborId)
                            const neighborNodeIds = neighbor!.getNeighbors().map((n) => toNodeId(n))
                            if (!neighborNodeIds.includes(nodeId)) {
                                mismatchCounter += 1
                            }
                        }
                    })
                })
                // NET-1074 Investigate why sometimes unidirectional connections remain.
                return mismatchCounter <= 2
            },
            20000,
            1000
        )
    }, 95000)
})
