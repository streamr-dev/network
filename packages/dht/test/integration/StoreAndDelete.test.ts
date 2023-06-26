import { LatencyType, Simulator } from '../../src/connection/Simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockConnectionDhtNode, waitConnectionManagersReadyForTesting } from '../utils/utils'
import { isSamePeerDescriptor, PeerID } from '../../src/exports'
import { Any } from '../../src/proto/google/protobuf/any'

describe('Storing data in DHT', () => {
    let entryPoint: DhtNode
    let nodes: DhtNode[]
    let entrypointDescriptor: PeerDescriptor
    const simulator = new Simulator(LatencyType.RANDOM)
    const NUM_NODES = 5
    const MAX_CONNECTIONS = 5
    const K = 4
    const nodeIndicesById: Record<string, number> = {}

    const getRandomNode = () => {
        return nodes[Math.floor(Math.random() * nodes.length)]
    }

    beforeEach(async () => {
        nodes = []
        const entryPointId = '0'
        entryPoint = await createMockConnectionDhtNode(entryPointId, simulator,
            undefined, K, entryPointId, MAX_CONNECTIONS)
        nodes.push(entryPoint)
        nodeIndicesById[entryPoint.getNodeId().toKey()] = 0
        entrypointDescriptor = {
            kademliaId: entryPoint.getNodeId().value,
            type: NodeType.NODEJS,
            nodeName: entryPointId
        }
        nodes.push(entryPoint)
        for (let i = 1; i < NUM_NODES; i++) {
            const nodeId = `${i}`
            const node = await createMockConnectionDhtNode(nodeId, simulator, 
                undefined, K, nodeId, MAX_CONNECTIONS, 60000)
            nodeIndicesById[node.getNodeId().toKey()] = i
            nodes.push(node)
        }
        await Promise.all(nodes.map((node) => node.joinDht(entrypointDescriptor)))
        await waitConnectionManagersReadyForTesting(nodes.map((node) => node.connectionManager!), MAX_CONNECTIONS)
    }, 90000)

    afterEach(async () => {
        await Promise.all(nodes.map((node) => node.stop()))
    })

    it('Data can be deleted', async () => {
        const storingNode = getRandomNode()
        const dataKey = PeerID.fromString('3232323e12r31r3')
        const data = Any.pack(entrypointDescriptor, PeerDescriptor)
        const successfulStorers = await storingNode.storeDataToDht(dataKey.value, data)
        expect(successfulStorers.length).toBeGreaterThan(4)
        await storingNode.deleteDataFromDht(dataKey.value)

        const fetchingNode = getRandomNode()
        const results = await fetchingNode.getDataFromDht(dataKey.value)
        results.dataEntries!.forEach((entry) => {
            const fetchedDescriptor = Any.unpack(entry.data!, PeerDescriptor)
            expect(entry.deleted).toBeTrue()
            expect(isSamePeerDescriptor(fetchedDescriptor, entrypointDescriptor)).toBeTrue()
        })
    }, 90000)

    it('Data can be deleted and re-stored', async () => {
        const storingNode = getRandomNode()
        const dataKey = PeerID.fromString('3232323e12r31r3')
        const data = Any.pack(entrypointDescriptor, PeerDescriptor)
        const successfulStorers1 = await storingNode.storeDataToDht(dataKey.value, data)
        expect(successfulStorers1.length).toBeGreaterThan(4)
        await storingNode.deleteDataFromDht(dataKey.value)

        const fetchingNode = getRandomNode()
        const results1 = await fetchingNode.getDataFromDht(dataKey.value)
        results1.dataEntries!.forEach((entry) => {
            const fetchedDescriptor = Any.unpack(entry.data!, PeerDescriptor)
            expect(entry.deleted).toBeTrue()
            expect(isSamePeerDescriptor(fetchedDescriptor, entrypointDescriptor)).toBeTrue()
        })

        const successfulStorers2 = await storingNode.storeDataToDht(dataKey.value, data)
        expect(successfulStorers2.length).toBeGreaterThan(4)

        const results2 = await fetchingNode.getDataFromDht(dataKey.value)
        results2.dataEntries!.forEach((entry) => {
            const fetchedDescriptor = Any.unpack(entry.data!, PeerDescriptor)
            expect(entry.deleted).toBeFalse()
            expect(isSamePeerDescriptor(fetchedDescriptor, entrypointDescriptor)).toBeTrue()
        })
    }, 90000)
})
