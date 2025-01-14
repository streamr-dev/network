import { Simulator } from '../../src/connection/simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { toDhtAddress } from '../../src/identifiers'
import { createMockConnectionDhtNode, createMockConnectionLayer1Node, createMockPeerDescriptor } from '../utils/utils'

const NODE_COUNT = 48
const NUM_OF_NODES_PER_KBUCKET = 8

describe('Layer1', () => {
    let simulator: Simulator
    const entryPoint0Descriptor = createMockPeerDescriptor()
    let layer0EntryPoint: DhtNode
    let nodes: DhtNode[]
    let layer1CleanUp: DhtNode[]

    beforeEach(async () => {
        simulator = new Simulator()
        layer0EntryPoint = await createMockConnectionDhtNode(simulator, toDhtAddress(entryPoint0Descriptor.nodeId))
        await layer0EntryPoint.joinDht([entryPoint0Descriptor])

        nodes = []
        layer1CleanUp = []

        for (let i = 0; i < NODE_COUNT; i++) {
            const node = await createMockConnectionDhtNode(simulator, undefined, undefined, undefined, 60000)
            nodes.push(node)
        }

        await Promise.all(nodes.map((node) => node.joinDht([entryPoint0Descriptor])))
    }, 30000)

    afterEach(async () => {
        await Promise.all(layer1CleanUp.map((node) => node.stop()))
        await Promise.all(nodes.map((node) => node.stop()))
        await layer0EntryPoint.stop()
        simulator.stop()
    })

    it('single layer1 dht', async () => {
        const layer1EntryPoint = await createMockConnectionLayer1Node(layer0EntryPoint)
        await layer1EntryPoint.joinDht([entryPoint0Descriptor])
        layer1CleanUp.push(layer1EntryPoint)

        const layer1Nodes: DhtNode[] = []
        for (let i = 0; i < NODE_COUNT; i++) {
            const layer0 = nodes[i]
            const layer1 = await createMockConnectionLayer1Node(layer0, undefined, NUM_OF_NODES_PER_KBUCKET)
            layer1Nodes.push(layer1)
            layer1CleanUp.push(layer1)
        }

        await Promise.all(layer1Nodes.map((node) => node.joinDht([entryPoint0Descriptor])))

        for (let i = 0; i < NODE_COUNT; i++) {
            const layer0Node = nodes[i]
            const layer1Node = layer1Nodes[i]
            expect(layer1Node.getNodeId()).toEqual(layer0Node.getNodeId())
            expect(layer1Node.getConnectionsView().getConnectionCount()).toEqual(
                layer0Node.getConnectionsView().getConnectionCount()
            )
            expect(layer1Node.getNeighborCount()).toBeGreaterThanOrEqual(NUM_OF_NODES_PER_KBUCKET / 2)
            expect(layer1Node.getConnectionsView().getConnections()).toEqual(
                layer0Node.getConnectionsView().getConnections()
            )
        }
    }, 120000)

    it('multiple layer1 dht', async () => {
        const stream1EntryPoint = await createMockConnectionLayer1Node(layer0EntryPoint, 'one')
        await stream1EntryPoint.joinDht([entryPoint0Descriptor])

        const stream2EntryPoint = await createMockConnectionLayer1Node(layer0EntryPoint, 'two')
        await stream2EntryPoint.joinDht([entryPoint0Descriptor])

        const stream3EntryPoint = await createMockConnectionLayer1Node(layer0EntryPoint, 'three')
        await stream3EntryPoint.joinDht([entryPoint0Descriptor])

        const stream4EntryPoint = await createMockConnectionLayer1Node(layer0EntryPoint, 'four')
        await stream4EntryPoint.joinDht([entryPoint0Descriptor])

        layer1CleanUp.push(stream1EntryPoint)
        layer1CleanUp.push(stream2EntryPoint)
        layer1CleanUp.push(stream3EntryPoint)
        layer1CleanUp.push(stream4EntryPoint)

        const stream1: DhtNode[] = []
        const stream2: DhtNode[] = []
        const stream3: DhtNode[] = []
        const stream4: DhtNode[] = []

        for (let i = 0; i < NODE_COUNT; i++) {
            const layer0 = nodes[i]
            const one = await createMockConnectionLayer1Node(layer0, 'one')
            const two = await createMockConnectionLayer1Node(layer0, 'two')
            const three = await createMockConnectionLayer1Node(layer0, 'three')
            const four = await createMockConnectionLayer1Node(layer0, 'four')

            stream1.push(one)
            stream2.push(two)
            stream3.push(three)
            stream4.push(four)

            layer1CleanUp.push(one)
            layer1CleanUp.push(two)
            layer1CleanUp.push(three)
            layer1CleanUp.push(four)
        }

        await Promise.all(layer1CleanUp.map((node) => node.joinDht([entryPoint0Descriptor])))

        for (let i = 0; i < NODE_COUNT; i++) {
            const layer0Node = nodes[i]
            const stream1Node = stream1[i]
            const stream2Node = stream2[i]
            const stream3Node = stream3[i]
            const stream4Node = stream4[i]

            expect(layer0Node.getConnectionsView().getConnectionCount()).toEqual(
                stream1Node.getConnectionsView().getConnectionCount()
            )
            expect(layer0Node.getConnectionsView().getConnectionCount()).toEqual(
                stream2Node.getConnectionsView().getConnectionCount()
            )
            expect(layer0Node.getConnectionsView().getConnectionCount()).toEqual(
                stream3Node.getConnectionsView().getConnectionCount()
            )
            expect(layer0Node.getConnectionsView().getConnectionCount()).toEqual(
                stream4Node.getConnectionsView().getConnectionCount()
            )
        }
    }, 120000)

    // TODO: Make this work
    // it('layer1 routing', async () => {
    //     const layer1EntryPoint = await createMockConnectionLayer1Node(layer0EntryPoint.getNodeId().toString(), layer0EntryPoint)
    //     await layer1EntryPoint.joinDht(entryPoint0Descriptor)
    //     layer1CleanUp.push(layer1EntryPoint)
    //
    //     const receivedMessages: Map<string, Set<string>> = new Map()
    //
    //     const layer1Nodes: DhtNode[] = []
    //     for (let i = 0; i < NODE_COUNT; i++) {
    //         const layer0 = nodes[i]
    //         if (i > NODE_COUNT - 5) {
    //             const layer1 = await createMockConnectionLayer1Node(layer0.getNodeId().toString(), layer0)
    //             layer1Nodes.push(layer1)
    //             layer1CleanUp.push(layer1)
    //             receivedMessages.set(layer0.getNodeId().toKey(), new Set())
    //             layer1.on('message', (msg: Message) => {
    //                 const peerId = PeerID.fromValue(msg.sourceDescriptor!.nodeId)
    //                 receivedMessages.get(layer0.getNodeId().toKey())!.add(peerId.toKey())
    //             })
    //         }
    //     }
    //
    //     await Promise.all(layer1Nodes.map((node) => node.joinDht(entryPoint0Descriptor)))
    //
    //     layer1Nodes.forEach((sender) => {
    //         layer1Nodes.forEach(async (receiver) => {
    //             if (!sender.getNodeId().equals(receiver.getNodeId())) {
    //                 const rpcWrapper = createWrappedClosestPeersRequest(sender.getPeerDescriptor(), receiver.getPeerDescriptor())
    //                 const message: Message = {
    //                     serviceId: 'service',
    //                     messageId: v4(),
    //                     body: {
    //                         oneofKind: 'rpcMessage',
    //                         rpcMessage: rpcWrapper
    //                     },
    //                     sourceDescriptor: sender.getPeerDescriptor(),
    //                     targetDescriptor: receiver.getPeerDescriptor()
    //                 }
    //                 await sender.doRouteMessage({
    //                     message,
    //                     target: receiver.getPeerDescriptor().nodeId,
    //                     sourcePeer: sender.getPeerDescriptor(),
    //                     requestId: v4(),
    //                     reachableThrough: [],
    //                     routingPath: []
    //                 })
    //             }
    //         })
    //     })
    //
    //     await until(() => {
    //         return [...receivedMessages.values()].every((set) => {
    //             return set.size === receivedMessages.size - 1
    //         })
    //     }, 15000)
    //
    // }, 120000)
})
