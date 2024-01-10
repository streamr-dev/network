/* eslint-disable no-console */
import { LatencyType, Simulator } from '../../src/connection/simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { createMockConnectionDhtNode, waitNodesReadyForTesting } from '../utils/utils'
import { SortedContactList } from '../../src/dht/contact/SortedContactList'
import { createMockDataEntry, expectEqualData } from '../utils/mock/mockDataEntry'
import { createRandomDhtAddress, getDhtAddressFromRaw } from '../../src/identifiers'
import { range, shuffle } from 'lodash'
import { DataEntry, PeerDescriptor } from '../../src/exports'

const DATA = createMockDataEntry()
const NUM_NODES = 100
const MAX_CONNECTIONS = 80
const K = 8
const ENTRY_POINT_INDEX = 0

const getDataEntries = (node: DhtNode): DataEntry[] => {
    // @ts-expect-error private field
    const store = node.localDataStore
    return Array.from(store.values(getDhtAddressFromRaw(DATA.key)))
}

describe('Replicate data from node to node in DHT', () => {

    let nodes: DhtNode[]
    let entryPointDescriptor: PeerDescriptor
    const simulator = new Simulator(LatencyType.FIXED, 20)

    beforeEach(async () => {
        const entryPoint = await createMockConnectionDhtNode(simulator, createRandomDhtAddress(), K, MAX_CONNECTIONS)
        entryPointDescriptor = entryPoint.getLocalPeerDescriptor()
        await entryPoint.joinDht([entryPointDescriptor])
        nodes = []
        nodes.push(entryPoint)
        for (let i = 1; i < NUM_NODES; i++) {
            const node = await createMockConnectionDhtNode(
                simulator,
                createRandomDhtAddress(),
                K,
                MAX_CONNECTIONS,
                undefined,
                [entryPoint.getLocalPeerDescriptor()]
            )
            nodes.push(node)
        }
    }, 60000)

    afterEach(async () => {
        await Promise.all(nodes.map(async (node) => await node.stop()))
    }, 60000)

    afterAll(async () => {
        simulator.stop()
    })

    it('Data replicates to the closest node no matter where it is stored', async () => {
        // calculate offline which node is closest to the data
        const sortedList = new SortedContactList<DhtNode>({ 
            referenceId: getDhtAddressFromRaw(DATA.key),
            maxSize: 10000, 
            allowToContainReferenceId: true, 
            emitEvents: false 
        })
        nodes.forEach((node) => sortedList.addContact(node))

        const closest = sortedList.getAllContacts()
        const successfulStorers = await nodes[0].storeDataToDht(getDhtAddressFromRaw(DATA.key), DATA.data!)
        expect(successfulStorers.length).toBe(1)

        await Promise.all(
            nodes.map(async (node, i) => {
                if (i !== ENTRY_POINT_INDEX) {
                    await node.joinDht([entryPointDescriptor])
                }
            })
        )
        await waitNodesReadyForTesting(nodes)

        const data = getDataEntries(closest[0])
        expect(data).toHaveLength(1)
        expectEqualData(data[0], DATA)
    }, 180000)

    it('Data replicates to the last remaining node if most of the other nodes leave gracefully', async () => {
        await Promise.all(
            nodes.map(async (node, i) => {
                if (i !== ENTRY_POINT_INDEX) {
                    await node.joinDht([entryPointDescriptor])
                }
            })
        )
        await waitNodesReadyForTesting(nodes)

        const randomIndex = Math.floor(Math.random() * nodes.length)
        await nodes[randomIndex].storeDataToDht(getDhtAddressFromRaw(DATA.key), DATA.data!)

        const nodeIndices = shuffle(range(nodes.length))
        const MIN_NODE_COUNT = 20
        while (nodeIndices.length > MIN_NODE_COUNT) {
            const index = nodeIndices.pop()!
            await nodes[index].stop()
        }

        const randomNonStoppedNode = nodes[nodeIndices.pop()!]
        const data = await randomNonStoppedNode.getDataFromDht(getDhtAddressFromRaw(DATA.key))
        expect(data).toHaveLength(1)
        expectEqualData(data[0], DATA)
    }, 180000)
})
