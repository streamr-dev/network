import { DhtNode, Simulator, PeerDescriptor, ConnectionManager, getRandomRegion, NodeType } from '@streamr/dht'
import { RandomGraphNode } from '../../src/logic/RandomGraphNode'
import { range } from 'lodash'
import { waitForCondition, hexToBinary } from '@streamr/utils'
import { Logger } from '@streamr/utils'
import { createRandomGraphNode } from '../../src/logic/createRandomGraphNode'
import { createRandomNodeId } from '../utils/utils'

const logger = new Logger(module)

describe('RandomGraphNode-DhtNode', () => {
    const numOfNodes = 64
    let dhtNodes: DhtNode[]
    let dhtEntryPoint: DhtNode
    let entryPointRandomGraphNode: RandomGraphNode
    let graphNodes: RandomGraphNode[]

    const streamId = 'Stream1'
    const entrypointDescriptor: PeerDescriptor = {
        kademliaId: hexToBinary(createRandomNodeId()),
        nodeName: 'entrypoint',
        type: NodeType.NODEJS,
        region: getRandomRegion()
    }

    const peerDescriptors: PeerDescriptor[] = range(numOfNodes).map((i) => {
        return {
            kademliaId: hexToBinary(createRandomNodeId()),
            nodeName: `node${i}`,
            type: NodeType.NODEJS,
            region: getRandomRegion()
        }
    })
    beforeEach(async () => {

        Simulator.useFakeTimers()
        const simulator = new Simulator()
        const entrypointCm = new ConnectionManager({
            ownPeerDescriptor: entrypointDescriptor,
            nodeName: entrypointDescriptor.nodeName,
            simulator
        })

        const cms: ConnectionManager[] = range(numOfNodes).map((i) =>
            new ConnectionManager({
                ownPeerDescriptor: peerDescriptors[i],
                nodeName: peerDescriptors[i].nodeName,
                simulator
            })
        )

        dhtEntryPoint = new DhtNode({
            transportLayer: entrypointCm,
            peerDescriptor: entrypointDescriptor,
            serviceId: streamId
        })

        dhtNodes = range(numOfNodes).map((i) => new DhtNode({
            transportLayer: cms[i],
            peerDescriptor: peerDescriptors[i],
            serviceId: streamId
        }))

        graphNodes = range(numOfNodes).map((i) => createRandomGraphNode({
            randomGraphId: streamId,
            layer1: dhtNodes[i],
            P2PTransport: cms[i],
            connectionLocker: cms[i],
            ownPeerDescriptor: peerDescriptors[i],
            neighborUpdateInterval: 2000
        }))

        entryPointRandomGraphNode = createRandomGraphNode({
            randomGraphId: streamId,
            layer1: dhtEntryPoint,
            P2PTransport: entrypointCm,
            connectionLocker: entrypointCm,
            ownPeerDescriptor: entrypointDescriptor,
            neighborUpdateInterval: 2000
        })

        await dhtEntryPoint.start()
        await dhtEntryPoint.joinDht([entrypointDescriptor])
        await Promise.all(dhtNodes.map((node) => node.start()))
    })

    afterEach(async () => {
        await dhtEntryPoint.stop()
        entryPointRandomGraphNode.stop()
        await Promise.all(dhtNodes.map((node) => node.stop()))
        await Promise.all(graphNodes.map((node) => node.stop()))
        Simulator.useFakeTimers(false)
    })

    it('happy path single node ', async () => {
        await entryPointRandomGraphNode.start()
        await dhtNodes[0].joinDht([entrypointDescriptor])

        await graphNodes[0].start()

        await waitForCondition(() => graphNodes[0].getTargetNeighborIds().length === 1)
        expect(graphNodes[0].getNearbyNodeView().getIds().length).toEqual(1)
        expect(graphNodes[0].getTargetNeighborIds().length).toEqual(1)
    })

    it('happy path 4 nodes', async () => {
        entryPointRandomGraphNode.start()
        range(4).map((i) => graphNodes[i].start())
        await Promise.all(range(4).map(async (i) => {
            await dhtNodes[i].joinDht([entrypointDescriptor])
        }))

        await waitForCondition(() => range(4).every((i) => graphNodes[i].getTargetNeighborIds().length === 4))
        range(4).map((i) => {
            expect(graphNodes[i].getNearbyNodeView().getIds().length).toBeGreaterThanOrEqual(4)
            expect(graphNodes[i].getTargetNeighborIds().length).toBeGreaterThanOrEqual(4)
        })

        // Check bidirectionality
        const allNodes = graphNodes
        allNodes.push(entryPointRandomGraphNode)
        range(5).map((i) => {
            allNodes[i].getNearbyNodeView().getIds().forEach((nodeId) => {
                const neighbor = allNodes.find((node) => {
                    return node.getOwnNodeId() === nodeId
                })
                expect(neighbor!.getTargetNeighborIds().includes(allNodes[i].getOwnNodeId())).toEqual(true)
            })
        })
    }, 10000)

    it('happy path 64 nodes', async () => {
        await Promise.all(range(numOfNodes).map((i) => graphNodes[i].start()))
        await Promise.all(range(numOfNodes).map((i) => {
            dhtNodes[i].joinDht([entrypointDescriptor])
        }))
        await Promise.all(graphNodes.map((node) =>
            waitForCondition(() => node.getTargetNeighborIds().length >= 4, 10000)
        ))

        const avg = graphNodes.reduce((acc, curr) => {
            return acc + curr.getTargetNeighborIds().length
        }, 0) / numOfNodes

        logger.info(`AVG Number of neighbors: ${avg}`)
        await Promise.all(graphNodes.map((node) =>
            waitForCondition(() => node.getNumberOfOutgoingHandshakes() === 0)
        ))
        await waitForCondition(() => {
            let mismatchCounter = 0
            graphNodes.forEach((node) => {
                const nodeId = node.getOwnNodeId()
                node.getTargetNeighborIds().forEach((neighborId) => {
                    if (neighborId !== entryPointRandomGraphNode.getOwnNodeId()) {
                        const neighbor = graphNodes.find((n) => n.getOwnNodeId() === neighborId)
                        if (!neighbor!.getTargetNeighborIds().includes(nodeId)) {
                            mismatchCounter += 1
                        }
                    }
                })
            })
            return mismatchCounter > 2
        }, 20000, 1000)
    }, 95000)
})
