import { DhtNode, Simulator, SimulatorTransport, PeerDescriptor, LatencyType, NodeType } from '@streamr/dht'
import { RandomGraphNode } from '../../src/logic/RandomGraphNode'
import { range } from 'lodash'
import { hexToBinary, waitForCondition } from '@streamr/utils'
import { createRandomGraphNode } from '../../src/logic/createRandomGraphNode'
import { createRandomNodeId } from '../utils/utils'

describe('RandomGraphNode-DhtNode-Latencies', () => {
    const numOfNodes = 64
    let dhtNodes: DhtNode[]
    let dhtEntryPoint: DhtNode
    let entryPointRandomGraphNode: RandomGraphNode
    let graphNodes: RandomGraphNode[]

    const streamId = 'Stream1'
    const entrypointDescriptor: PeerDescriptor = {
        kademliaId: hexToBinary(createRandomNodeId()),
        type: NodeType.NODEJS
    }

    const peerDescriptors: PeerDescriptor[] = range(numOfNodes).map(() => {
        return {
            kademliaId: hexToBinary(createRandomNodeId()),
            type: NodeType.NODEJS
        }
    })
    beforeEach(async () => {
        Simulator.useFakeTimers()
        const simulator = new Simulator(LatencyType.FIXED, 50)
        const entrypointCm = new SimulatorTransport(entrypointDescriptor, simulator)
        const cms: SimulatorTransport[] = range(numOfNodes).map((i) =>
            new SimulatorTransport(peerDescriptors[i], simulator)
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
            ownPeerDescriptor: peerDescriptors[i]
        }))
        entryPointRandomGraphNode = createRandomGraphNode({
            randomGraphId: streamId,
            layer1: dhtEntryPoint,
            P2PTransport: entrypointCm,
            connectionLocker: entrypointCm,
            ownPeerDescriptor: entrypointDescriptor
        })

        await dhtEntryPoint.start()
        await dhtEntryPoint.joinDht([entrypointDescriptor])
        await Promise.all(dhtNodes.map((node) => node.start()))
    })

    afterEach(async () => {
        dhtEntryPoint.stop()
        entryPointRandomGraphNode.stop()
        await Promise.all(dhtNodes.map((node) => node.stop()))
        await Promise.all(graphNodes.map((node) => node.stop()))
        Simulator.useFakeTimers(false)
    })

    it('happy path single node', async () => {
        await dhtNodes[0].joinDht([entrypointDescriptor])
        entryPointRandomGraphNode.start()
        await graphNodes[0].start()
        await Promise.all([
            waitForCondition(() => graphNodes[0].getNearbyNodeView().getIds().length === 1),
            waitForCondition(() => graphNodes[0].getTargetNeighborIds().length === 1)
        ])
        expect(graphNodes[0].getNearbyNodeView().getIds().length).toEqual(1)
        expect(graphNodes[0].getTargetNeighborIds().length).toEqual(1)
    })

    it('happy path 5 nodes', async () => {
        entryPointRandomGraphNode.start()
        range(4).map((i) => graphNodes[i].start())
        await Promise.all(range(4).map(async (i) => {
            await dhtNodes[i].joinDht([entrypointDescriptor])
        }))
        await Promise.all(range(4).map((i) => {
            return waitForCondition(() => {
                return graphNodes[i].getTargetNeighborIds().length >= 4
            }, 10000, 2000)
        }))
        range(4).map((i) => {
            expect(graphNodes[i].getNearbyNodeView().getIds().length).toBeGreaterThanOrEqual(4)
            expect(graphNodes[i].getTargetNeighborIds().length).toBeGreaterThanOrEqual(4)
        })
        // Check bidirectionality
        const allNodes = graphNodes
        allNodes.push(entryPointRandomGraphNode)
        range(5).map((i) => {
            const ownNodeId = allNodes[i].getOwnNodeId()
            allNodes[i].getNearbyNodeView().getIds().forEach((nodeId) => {
                const neighbor = allNodes.find((node) => {
                    return node.getOwnNodeId() === ownNodeId
                })
                expect(neighbor!.getTargetNeighborIds()).toContain(nodeId)
            })
        })
    }, 60000)

    it('happy path 64 nodes', async () => {
        await Promise.all(range(numOfNodes).map((i) => graphNodes[i].start()))
        await Promise.all(range(numOfNodes).map((i) => {
            dhtNodes[i].joinDht([entrypointDescriptor])
        }))
        await Promise.all(graphNodes.map((node) =>
            waitForCondition(() => node.getTargetNeighborIds().length >= 4, 10000)
        ))

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
    }, 90000)
})
