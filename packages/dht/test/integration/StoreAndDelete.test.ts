import { LatencyType, Simulator } from '../../src/connection/simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockConnectionDhtNode, createMockPeerDescriptor, waitConnectionManagersReadyForTesting } from '../utils/utils'
import { areEqualPeerDescriptors } from '../../src/helpers/peerIdFromPeerDescriptor'
import { Any } from '../../src/proto/google/protobuf/any'
import { createRandomNodeId } from '../../src/helpers/nodeId'

describe('Storing data in DHT', () => {
    let entryPoint: DhtNode
    let nodes: DhtNode[]
    let entrypointDescriptor: PeerDescriptor
    const simulator = new Simulator(LatencyType.REAL)
    const NUM_NODES = 5
    const MAX_CONNECTIONS = 5
    const K = 4

    const getRandomNode = () => {
        return nodes[Math.floor(Math.random() * nodes.length)]
    }

    beforeEach(async () => {
        nodes = []
        const entryPointId = '0'
        entryPoint = await createMockConnectionDhtNode(entryPointId, simulator,
            undefined, K, MAX_CONNECTIONS)
        nodes.push(entryPoint)
        entrypointDescriptor = entryPoint.getLocalPeerDescriptor()
        nodes.push(entryPoint)
        for (let i = 1; i < NUM_NODES; i++) {
            const nodeId = `${i}`
            const node = await createMockConnectionDhtNode(nodeId, simulator, 
                undefined, K, MAX_CONNECTIONS, 60000)
            nodes.push(node)
        }
        await Promise.all(nodes.map((node) => node.joinDht([entrypointDescriptor])))
        await waitConnectionManagersReadyForTesting(nodes.map((node) => node.connectionManager!), MAX_CONNECTIONS)
    }, 90000)

    afterEach(async () => {
        await Promise.all(nodes.map((node) => node.stop()))
    })

    it('Data can be deleted', async () => {
        const storingNode = getRandomNode()
        const dataKey = createRandomNodeId()
        const storedData = createMockPeerDescriptor()
        const data = Any.pack(storedData, PeerDescriptor)
        const successfulStorers = await storingNode.storeDataToDht(dataKey, data)
        expect(successfulStorers.length).toBeGreaterThan(4)
        await storingNode.deleteDataFromDht(dataKey, true)

        const fetchingNode = getRandomNode()
        const results = await fetchingNode.getDataFromDht(dataKey)
        results.forEach((entry) => {
            const fetchedDescriptor = Any.unpack(entry.data!, PeerDescriptor)
            expect(entry.deleted).toBeTrue()
            expect(areEqualPeerDescriptors(fetchedDescriptor, storedData)).toBeTrue()
        })
    }, 90000)

    it('Data can be deleted and re-stored', async () => {
        const storingNode = getRandomNode()
        const dataKey = createRandomNodeId()
        const storedData = createMockPeerDescriptor()
        const data = Any.pack(storedData, PeerDescriptor)
        const successfulStorers1 = await storingNode.storeDataToDht(dataKey, data)
        expect(successfulStorers1.length).toBeGreaterThan(4)
        await storingNode.deleteDataFromDht(dataKey, true)

        const fetchingNode = getRandomNode()
        const results1 = await fetchingNode.getDataFromDht(dataKey)
        results1.forEach((entry) => {
            const fetchedDescriptor = Any.unpack(entry.data!, PeerDescriptor)
            expect(entry.deleted).toBeTrue()
            expect(areEqualPeerDescriptors(fetchedDescriptor, storedData)).toBeTrue()
        })

        const successfulStorers2 = await storingNode.storeDataToDht(dataKey, data)
        expect(successfulStorers2.length).toBeGreaterThan(4)

        const results2 = await fetchingNode.getDataFromDht(dataKey)
        results2.forEach((entry) => {
            const fetchedDescriptor = Any.unpack(entry.data!, PeerDescriptor)
            expect(entry.deleted).toBeFalse()
            expect(areEqualPeerDescriptors(fetchedDescriptor, storedData)).toBeTrue()
        })
    }, 90000)
})
