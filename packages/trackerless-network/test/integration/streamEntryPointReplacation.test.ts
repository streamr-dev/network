import { LatencyType, Simulator, SimulatorTransport } from "@streamr/dht"
import { NetworkStack } from "../../src/NetworkStack"
import { createMockPeerDescriptor } from "../utils/utils"
import { ENTRYPOINT_STORE_LIMIT } from "../../src/logic/EntryPointDiscovery"
import { range } from "lodash"
import { StreamPartIDUtils } from "@streamr/protocol"
import { wait } from "@streamr/utils"

describe('Stream Entry Points are replaced when known entry points leave streams', () => {
    
    let simulator: Simulator
    let layer0EntryPoint: NetworkStack
    const entryPointPeerDescriptor = createMockPeerDescriptor()
    let initialNodesOnStream: NetworkStack[]
    let laterNodesOnStream: NetworkStack[]
    let newNodeInStream: NetworkStack

    const streamPartId = StreamPartIDUtils.parse('stream#0')

    const startNode = async () => {
        const peerDescriptor = createMockPeerDescriptor()
        const transport = new SimulatorTransport(peerDescriptor, simulator)
        await transport.start()
        const node = new NetworkStack({
            layer0: {
                transport,
                peerDescriptor,
                entryPoints: [entryPointPeerDescriptor]
            }
        })
        initialNodesOnStream.push(node)
        await node.start()
        return node
    }

    beforeEach(async () => {
        simulator = new Simulator(LatencyType.REAL)
        console.log(entryPointPeerDescriptor)
        const entryPointTransport = new SimulatorTransport(entryPointPeerDescriptor, simulator)
        layer0EntryPoint = new NetworkStack({
            layer0: {
                transport: entryPointTransport,
                peerDescriptor: entryPointPeerDescriptor,
                entryPoints: [entryPointPeerDescriptor]
            }
        })
        await entryPointTransport.start()
        await layer0EntryPoint.start()

        initialNodesOnStream = []
        await Promise.all(range(ENTRYPOINT_STORE_LIMIT).map(async () => {
            const node = await startNode()
            initialNodesOnStream.push(node)
        }))

        laterNodesOnStream = []
        await Promise.all(range(20).map(async () => {
            const node = await startNode()
            laterNodesOnStream.push(node)
        }))

        newNodeInStream = await startNode()
    })

    afterEach(async () => {
        await Promise.all([
            layer0EntryPoint.stop(),
            ...initialNodesOnStream.map((node) => node.stop()),
            ...laterNodesOnStream.map((node) => node.stop())
        ])
        simulator.stop()
    })

    it('stream entry points are replaced when nodes leave streams', async () => {
        for (const node of initialNodesOnStream) {
            await node.joinStreamPart(streamPartId)
        }
        for (const node of laterNodesOnStream) {
            await node.joinStreamPart(streamPartId)
        }
        console.log(laterNodesOnStream.map((node) => node.getStreamrNode().getNeighbors(streamPartId).length))
        // await Promise.all(initialNodesOnStream.map((node) => node.getStreamrNode().leaveStreamPart(streamPartId)))
        for (const node of initialNodesOnStream) {
            await node.getStreamrNode().leaveStreamPart(streamPartId)
        }
        await wait(5000)
        console.log(laterNodesOnStream.map((node) => node.getStreamrNode().getNeighbors(streamPartId).length))
        await newNodeInStream.joinStreamPart(streamPartId, { minCount: 4, timeout: 15000 })
        expect(newNodeInStream.getStreamrNode().getNeighbors(streamPartId).length).toBeGreaterThanOrEqual(4)
    }, 45000)
})