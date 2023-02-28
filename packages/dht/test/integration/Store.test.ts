import { LatencyType, Simulator } from '../../src/connection/Simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockConnectionDhtNode, waitConnectionManagersReadyForTesting } from '../utils'
import { isSamePeerDescriptor, PeerID } from '../../src/exports'
import { Any } from '../../src/proto/google/protobuf/any'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

describe('Storing data in DHT', () => {
    let entryPoint: DhtNode
    let nodes: DhtNode[]
    let entrypointDescriptor: PeerDescriptor
    const simulator = new Simulator(LatencyType.RANDOM)
    const NUM_NODES = 100
    const MAX_CONNECTIONS = 20
    const K = 2
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
                undefined, K, nodeId, MAX_CONNECTIONS)
            nodeIndicesById[node.getNodeId().toKey()] = i
            nodes.push(node)
        }
        await Promise.all(nodes.map((node) => node.joinDht(entrypointDescriptor)))
        await waitConnectionManagersReadyForTesting(nodes.map((node) => node.connectionManager!), MAX_CONNECTIONS)
    }, 60000)

    afterEach(async () => {
        await Promise.all(nodes.map((node) => node.stop()))
    })

    it('Data structures work locally', async () => {
        const storingNodeIndex = 34
        const dataKey = PeerID.fromString('3232323e12r31r3')
        const data = Any.pack(entrypointDescriptor, PeerDescriptor)

        logger.info('node ' + storingNodeIndex + ' starting to store data with key ' + dataKey.toString())
        await nodes[storingNodeIndex].doStoreData(nodes[storingNodeIndex].getPeerDescriptor(), { kademliaId: dataKey.value, data, ttl: 10000 })
        logger.info('store data over')

        logger.info('node ' + storingNodeIndex + ' starting to get data with key ' + dataKey.toString())
        const fetchedData = await nodes[storingNodeIndex].doGetData(dataKey)!
        fetchedData.forEach((entry) => {
            const fetchedDescriptor = Any.unpack(entry.data!, PeerDescriptor)
            expect(isSamePeerDescriptor(fetchedDescriptor, entrypointDescriptor)).toBeTrue()
        })
    }, 90000)

    it('Storing data works', async () => {
        const storingNodeIndex = 34
        const dataKey = PeerID.fromString('3232323e12r31r3')
        const data = Any.pack(entrypointDescriptor, PeerDescriptor)
        const successfulStorers = await nodes[storingNodeIndex].storeDataToDht(dataKey.value, data)
        expect(successfulStorers.length).toBeGreaterThan(4)
    }, 90000)

    it('Storing and getting data works', async () => {
        const storingNode = getRandomNode()
        const dataKey = PeerID.fromString('3232323e12r31r3')
        const data = Any.pack(entrypointDescriptor, PeerDescriptor)
        const successfulStorers = await storingNode.storeDataToDht(dataKey.value, data)
        expect(successfulStorers.length).toBeGreaterThan(4)

        const fetchingNode = getRandomNode()
        const results = await fetchingNode.getDataFromDht(dataKey.value)
        results.dataEntries!.forEach((entry) => {
            const fetchedDescriptor = Any.unpack(entry.data!, PeerDescriptor)
            expect(isSamePeerDescriptor(fetchedDescriptor, entrypointDescriptor)).toBeTrue()
        })
    }, 90000)
})
