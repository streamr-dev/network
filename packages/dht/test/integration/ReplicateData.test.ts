/* eslint-disable no-console */
import { LatencyType, Simulator } from '../../src/connection/simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockConnectionDhtNode, waitNodesReadyForTesting } from '../utils/utils'
import { execSync } from 'child_process'
import fs from 'fs'
import { Logger } from '@streamr/utils'
import { SortedContactList } from '../../src/dht/contact/SortedContactList'
import { Contact } from '../../src/dht/contact/Contact'
import { DhtAddress, getDhtAddressFromRaw, getNodeIdFromPeerDescriptor, getRawFromDhtAddress } from '../../src/identifiers'
import { createMockDataEntry } from '../utils/mock/mockDataEntry'
import { LocalDataStore } from '../../src/dht/store/LocalDataStore'

const logger = new Logger(module)

jest.setTimeout(60000)

const NUM_NODES = 100
const MAX_CONNECTIONS = 80
const K = 8

describe('Replicate data from node to node in DHT', () => {

    let entryPoint: DhtNode
    let nodes: DhtNode[]
    let entrypointDescriptor: PeerDescriptor
    const simulator = new Simulator(LatencyType.FIXED, 20)
    const nodesById: Map<DhtAddress, DhtNode> = new Map()

    if (!fs.existsSync('test/data/nodeids.json')) {
        console.log('ground truth data does not exist yet, generating..')
        execSync('npm run prepare-kademlia-simulation')
    }

    const dhtIds: Array<{ type: string, data: Array<number> }> = JSON.parse(fs.readFileSync('test/data/nodeids.json').toString())
    /*
    const getRandomNode = () => {
        return nodes[Math.floor(Math.random() * nodes.length)]
    }
    */

    const getEntries = (key: DhtAddress, localDataStore: LocalDataStore) => {
        return Array.from(localDataStore.values(key))
    }

    beforeEach(async () => {
        nodes = []
        entryPoint = await createMockConnectionDhtNode(simulator,
            getDhtAddressFromRaw(Uint8Array.from(dhtIds[0].data)), K, MAX_CONNECTIONS)
        nodes.push(entryPoint)
        nodesById.set(entryPoint.getNodeId(), entryPoint)

        entrypointDescriptor = {
            nodeId: getRawFromDhtAddress(entryPoint.getNodeId()),
            details: {
                type: NodeType.NODEJS
            }
        }

        nodes.push(entryPoint)

        for (let i = 1; i < NUM_NODES; i++) {
            const node = await createMockConnectionDhtNode(simulator,
                getDhtAddressFromRaw(Uint8Array.from(dhtIds[i].data)), K, MAX_CONNECTIONS)
            nodesById.set(node.getNodeId(), node)
            nodes.push(node)
        }
    })

    afterEach(async () => {
        await Promise.all([
            ...nodes.map(async (node) => await node.stop())
        ])
        logger.info('nodes stopped')
    })

    afterAll(async () => {
        simulator.stop()
    })

    it('Data replicates to the closest node no matter where it is stored', async () => {
        const dataKey = '333233323332336531327233317233' as DhtAddress  // TODO use random data
        const data = createMockDataEntry({ key: dataKey })

        // calculate offline which node is closest to the data

        const sortedList = new SortedContactList<Contact>({ 
            referenceId: dataKey,
            maxSize: 10000, 
            allowToContainReferenceId: true, 
            emitEvents: false 
        })

        nodes.forEach((node) => {
            sortedList.addContact(new Contact(node.getLocalPeerDescriptor())
            )
        })

        const closest = sortedList.getAllContacts()

        logger.info('Nodes sorted according to distance to data are: ')
        closest.forEach((contact) => {
            logger.info(contact.getNodeId())
        })

        logger.info('node 0 joining to the DHT')

        await nodes[0].joinDht([entrypointDescriptor])

        logger.info('storing data to node 0')
        const successfulStorers = await nodes[0].storeDataToDht(dataKey, data.data!)
        expect(successfulStorers.length).toBe(1)
        logger.info('data successfully stored to node 0')

        logger.info('Nodes sorted according to distance to data with storing nodes marked are: ')

        closest.forEach((contact) => {
            const node = nodesById.get(contact.getNodeId())!
            let hasDataMarker = ''
            
            // @ts-expect-error private field
            const store = node.localDataStore
            if (getEntries(dataKey, store).length > 0) {
                hasDataMarker = '<-'
            }

            // eslint-disable-next-line max-len
            logger.info(getNodeIdFromPeerDescriptor(contact.getPeerDescriptor()) + ' ' + node.getNodeId() + hasDataMarker)
        })

        logger.info(NUM_NODES + ' nodes joining layer0 DHT')
        await Promise.all(
            nodes.map((node, i) => {
                if (i !== 0) {
                    node.joinDht([entrypointDescriptor])
                }
            })
        )

        logger.info('completed ' + NUM_NODES + ' nodes joining layer0 DHT')

        await waitNodesReadyForTesting(nodes)

        logger.info('After join of 99 nodes: nodes sorted according to distance to data with storing nodes marked are: ')

        closest.forEach((contact) => {
            const node = nodesById.get(contact.getNodeId())!
            let hasDataMarker = ''

            // @ts-expect-error private field
            const store = node.localDataStore
            if (getEntries(dataKey, store).length > 0) {
                hasDataMarker = '<-'
            }

            logger.info(node.getNodeId() + hasDataMarker)
        })

        const closestNode = nodesById.get(closest[0].getNodeId())!

        // @ts-expect-error private field
        const store = closestNode.localDataStore
        expect(getEntries(dataKey, store).length).toBeGreaterThanOrEqual(1)
    }, 180000)

    it('Data replicates to the last remaining node if all other nodes leave gracefully', async () => {
        const dataKey = '333233323332336531327233317233' as DhtAddress  // TODO use random data
        const data = createMockDataEntry({ key: dataKey })

        logger.info(NUM_NODES + ' nodes joining layer0 DHT')
        await Promise.all(
            nodes.map((node) => {
                node.joinDht([entrypointDescriptor])
            })
        )

        logger.info('completed ' + NUM_NODES + ' nodes joining layer0 DHT')

        await waitNodesReadyForTesting(nodes)

        const randomIndex = Math.floor(Math.random() * nodes.length)
        logger.info('storing data to a random node: ' + randomIndex)

        const successfulStorers = await nodes[randomIndex].storeDataToDht(dataKey, data.data!)

        logger.info('data successfully stored to ' + successfulStorers + ' nodes')

        const randomIndices = []
        for (let i = 0; i < nodes.length; i++) {
            randomIndices.push(i)
        }

        console.error(randomIndices)
        while (randomIndices.length > 1) {
            const index = Math.floor(Math.random() * randomIndices.length)
            const nodeIndex = randomIndices[index]
            randomIndices.splice(index, 1)
            // @ts-expect-error private field
            const store = nodes[nodeIndex].localDataStore
            logger.info('Stopping node ' + nodeIndex + ' ' +
                ((getEntries(dataKey, store).length > 0) ? ', has data' : ' does not have data'))

            await nodes[nodeIndex].stop()
        }

        logger.info('after random graceful leaving, node ' + randomIndices[0] + ' is left')

        // @ts-expect-error private field
        const firstStore = nodes[randomIndices[0]].localDataStore
        logger.info('data of ' + randomIndices[0] + ' was ' + getEntries(dataKey, firstStore))
        expect(getEntries(dataKey, firstStore).length).toBeGreaterThanOrEqual(1)

    }, 180000)
})
