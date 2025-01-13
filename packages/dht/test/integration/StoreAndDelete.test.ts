import { LatencyType, Simulator } from '../../src/connection/simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { createMockConnectionDhtNode, waitForStableTopology } from '../utils/utils'
import { createMockDataEntry, expectEqualData } from '../utils/mock/mockDataEntry'
import { randomDhtAddress, toDhtAddress } from '../../src/identifiers'
import { wait } from '@streamr/utils'

const NUM_NODES = 5
const MAX_CONNECTIONS = 5
const K = 4

describe('Storing data in DHT', () => {
    let nodes: DhtNode[]
    const simulator = new Simulator(LatencyType.REAL)

    const getRandomNode = () => {
        return nodes[Math.floor(Math.random() * nodes.length)]
    }

    beforeEach(async () => {
        nodes = []
        const entryPoint = await createMockConnectionDhtNode(simulator, randomDhtAddress(), K, MAX_CONNECTIONS)
        nodes.push(entryPoint)
        for (let i = 1; i < NUM_NODES; i++) {
            const node = await createMockConnectionDhtNode(simulator, undefined, K, MAX_CONNECTIONS, 60000)
            nodes.push(node)
        }
        await Promise.all(nodes.map((node) => node.joinDht([entryPoint.getLocalPeerDescriptor()])))
        await waitForStableTopology(nodes, MAX_CONNECTIONS)
    }, 90000)

    afterEach(async () => {
        await Promise.all(nodes.map((node) => node.stop()))
    })

    it('Data can be deleted', async () => {
        const storingNode = getRandomNode()
        const entry = createMockDataEntry()
        const successfulStorers = await storingNode.storeDataToDht(toDhtAddress(entry.key), entry.data!)
        expect(successfulStorers.length).toBeGreaterThan(4)
        await storingNode.deleteDataFromDht(toDhtAddress(entry.key), true)
        // Wait for the delete operation to propagate
        await wait(500)
        const fetchingNode = getRandomNode()
        const results = await fetchingNode.fetchDataFromDht(toDhtAddress(entry.key))
        results.forEach((result) => {
            expect(result.deleted).toBeTrue()
            expectEqualData(result, entry)
        })
    }, 90000)

    it('Data can be deleted and re-stored', async () => {
        const storingNode = getRandomNode()
        const entry = createMockDataEntry()
        const successfulStorers1 = await storingNode.storeDataToDht(toDhtAddress(entry.key), entry.data!)
        expect(successfulStorers1.length).toBeGreaterThan(4)
        await storingNode.deleteDataFromDht(toDhtAddress(entry.key), true)
        // Wait for the delete operation to propagate
        await wait(500)
        const fetchingNode = getRandomNode()
        const results1 = await fetchingNode.fetchDataFromDht(toDhtAddress(entry.key))
        results1.forEach((result) => {
            expect(result.deleted).toBeTrue()
            expectEqualData(result, entry)
        })
        const successfulStorers2 = await storingNode.storeDataToDht(toDhtAddress(entry.key), entry.data!)
        expect(successfulStorers2.length).toBeGreaterThan(4)
        const results2 = await fetchingNode.fetchDataFromDht(toDhtAddress(entry.key))
        results2.forEach((result) => {
            expect(result.deleted).toBeFalse()
            expectEqualData(result, entry)
        })
    }, 90000)
})
