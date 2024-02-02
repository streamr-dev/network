import { ConnectionManager, DhtNode, PeerDescriptor, Simulator, SimulatorTransport, getNodeIdFromPeerDescriptor, getRandomRegion } from '@streamr/dht'
import { Logger, waitForCondition } from '@streamr/utils'
import { range } from 'lodash'
import { RandomGraphNode } from '../../src/logic/RandomGraphNode'
import { createRandomGraphNode } from '../../src/logic/createRandomGraphNode'
import { createMockPeerDescriptor } from '../utils/utils'
import { StreamPartIDUtils } from '@streamr/protocol'
import { Layer1Node } from '../../src/logic/Layer1Node'

const logger = new Logger(module)

describe('RandomGraphNode-DhtNode', () => {
    const nodeCount = 64
    let layer1Nodes: Layer1Node[]
    let dhtEntryPoint: Layer1Node
    let entryPointRandomGraphNode: RandomGraphNode
    let graphNodes: RandomGraphNode[]

    const streamPartId = StreamPartIDUtils.parse('stream#0')
    const entrypointDescriptor = createMockPeerDescriptor({
        region: getRandomRegion()
    })

    const peerDescriptors: PeerDescriptor[] = range(nodeCount).map(() => {
        return createMockPeerDescriptor({
            region: getRandomRegion()
        })
    })
    beforeEach(async () => {
        const simulator = new Simulator()
        const entrypointCm = new SimulatorTransport(
            entrypointDescriptor,
            simulator
        )
        await entrypointCm.start()

        const cms: ConnectionManager[] = range(nodeCount).map((i) =>
            new SimulatorTransport(
                peerDescriptors[i],
                simulator
            )
        )
        await Promise.all(cms.map((cm) => cm.start()))

        dhtEntryPoint = new DhtNode({
            transport: entrypointCm,
            stopGivenTransport: true,
            peerDescriptor: entrypointDescriptor,
            serviceId: streamPartId
        })

        layer1Nodes = range(nodeCount).map((i) => new DhtNode({
            transport: cms[i],
            stopGivenTransport: true,
            peerDescriptor: peerDescriptors[i],
            serviceId: streamPartId
        }))

        graphNodes = range(nodeCount).map((i) => createRandomGraphNode({
            streamPartId,
            layer1Node: layer1Nodes[i],
            transport: cms[i],
            connectionLocker: cms[i],
            localPeerDescriptor: peerDescriptors[i],
            neighborUpdateInterval: 2000,
            isLocalNodeEntryPoint: () => false
        }))

        entryPointRandomGraphNode = createRandomGraphNode({
            streamPartId,
            layer1Node: dhtEntryPoint,
            transport: entrypointCm,
            connectionLocker: entrypointCm,
            localPeerDescriptor: entrypointDescriptor,
            neighborUpdateInterval: 2000,
            isLocalNodeEntryPoint: () => false
        })

        await dhtEntryPoint.start()
        await dhtEntryPoint.joinDht([entrypointDescriptor])
        await Promise.all(layer1Nodes.map((node) => node.start()))
    })

    afterEach(async () => {
        await dhtEntryPoint.stop()
        entryPointRandomGraphNode.stop()
        await Promise.all(layer1Nodes.map((node) => node.stop()))
        await Promise.all(graphNodes.map((node) => node.stop()))
    })

    it('happy path single node ', async () => {
        await entryPointRandomGraphNode.start()
        await layer1Nodes[0].joinDht([entrypointDescriptor])

        await graphNodes[0].start()

        await waitForCondition(() => graphNodes[0].getNeighbors().length === 1)
        expect(graphNodes[0].getNearbyNodeView().getIds().length).toEqual(1)
        expect(graphNodes[0].getNeighbors().length).toEqual(1)
    })

    it('happy path 4 nodes', async () => {
        entryPointRandomGraphNode.start()
        range(4).forEach((i) => graphNodes[i].start())
        await Promise.all(range(4).map(async (i) => {
            await layer1Nodes[i].joinDht([entrypointDescriptor])
        }))

        await waitForCondition(() => range(4).every((i) => graphNodes[i].getNeighbors().length === 4))
        range(4).forEach((i) => {
            expect(graphNodes[i].getNearbyNodeView().getIds().length).toBeGreaterThanOrEqual(4)
            expect(graphNodes[i].getNeighbors().length).toBeGreaterThanOrEqual(4)
        })

        // Check bidirectionality
        const allNodes = graphNodes
        allNodes.push(entryPointRandomGraphNode)
        range(5).forEach((i) => {
            allNodes[i].getNearbyNodeView().getIds().forEach((nodeId) => {
                const neighbor = allNodes.find((node) => {
                    return node.getOwnNodeId() === nodeId
                })
                const neighborIds = neighbor!.getNeighbors().map((n) => getNodeIdFromPeerDescriptor(n))
                expect(neighborIds.includes(allNodes[i].getOwnNodeId())).toEqual(true)
            })
        })
    }, 10000)

    it('happy path 64 nodes', async () => {
        await Promise.all(range(nodeCount).map((i) => graphNodes[i].start()))
        await Promise.all(range(nodeCount).map((i) => {
            layer1Nodes[i].joinDht([entrypointDescriptor])
        }))
        await Promise.all(graphNodes.map((node) =>
            waitForCondition(() => node.getNeighbors().length >= 4, 10000)
        ))

        const avg = graphNodes.reduce((acc, curr) => {
            return acc + curr.getNeighbors().length
        }, 0) / nodeCount

        logger.info(`AVG Number of neighbors: ${avg}`)
        await Promise.all(graphNodes.map((node) =>
            waitForCondition(() => node.getOutgoingHandshakeCount() === 0)
        ))
        await waitForCondition(() => {
            let mismatchCounter = 0
            graphNodes.forEach((node) => {
                const nodeId = node.getOwnNodeId()
                node.getNeighbors().forEach((neighbor) => {
                    const neighborId = getNodeIdFromPeerDescriptor(neighbor)
                    if (neighborId !== entryPointRandomGraphNode.getOwnNodeId()) {
                        const neighbor = graphNodes.find((n) => n.getOwnNodeId() === neighborId)
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
    }, 95000)
})
