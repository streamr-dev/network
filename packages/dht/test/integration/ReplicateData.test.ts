/* eslint-disable no-console */
import { LatencyType, Simulator } from '../../src/connection/simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockConnectionDhtNode, waitNodesReadyForTesting } from '../utils/utils'
import { Logger } from '@streamr/utils'
import { PeerID } from '../../src/helpers/PeerID'
import { getNodeIdFromPeerDescriptor } from '../../src/helpers/peerIdFromPeerDescriptor'
import { Any } from '../../src/proto/google/protobuf/any'
import { SortedContactList } from '../../src/dht/contact/SortedContactList'
import { Contact } from '../../src/dht/contact/Contact'
import { NodeID } from '../../src/helpers/nodeId'
import crypto from 'crypto'
import { createRandomNodeId } from '../../src/helpers/nodeId'

const logger = new Logger(module)

jest.setTimeout(60000)

const DATA_KEY = PeerID.fromString('3232323e12r31r3')
const DATA_VALUE = Any.pack({ nodeId: crypto.randomBytes(10), type: NodeType.NODEJS, }, PeerDescriptor)
const NUM_NODES = 100
const MAX_CONNECTIONS = 80
const K = 8

const getDataValues = (node: DhtNode): PeerDescriptor[] => {
    // @ts-expect-error private field
    const store = node.localDataStore
    return Array.from(store.getEntries(DATA_KEY.value).values())
        .map((value) => Any.unpack(value.data!, PeerDescriptor))
}

const hasData = (node: DhtNode): boolean => {
    return getDataValues(node).length > 0
}

describe('Replicate data from node to node in DHT', () => {

    let entryPoint: DhtNode
    let nodes: DhtNode[]
    const nodesById: Map<NodeID, DhtNode> = new Map()
    const simulator = new Simulator(LatencyType.FIXED, 20)

    beforeEach(async () => {
        entryPoint = await createMockConnectionDhtNode(simulator, createRandomNodeId(), K, MAX_CONNECTIONS)
        await entryPoint.joinDht([entryPoint.getLocalPeerDescriptor()])

        nodes = []
        nodesById.clear()
        for (let i = 0; i < NUM_NODES; i++) {
            const node = await createMockConnectionDhtNode(
                simulator,
                createRandomNodeId(),
                K,
                MAX_CONNECTIONS,
                undefined,
                [entryPoint.getLocalPeerDescriptor()]
            )
            nodes.push(node)
            nodesById.set(node.getNodeId(), node)
        }
    })

    afterEach(async () => {
        await Promise.all([
            ...nodes.map(async (node) => await node.stop())
        ])
        await entryPoint.stop()
        logger.info('nodes stopped')
    })

    afterAll(async () => {
        simulator.stop()
    })

    it('Data replicates to the closest node no matter where it is stored', async () => {
        // calculate offline which node is closest to the data
        const sortedList = new SortedContactList<Contact>({ 
            referenceId: DATA_KEY.toNodeId(),
            maxSize: 10000, 
            allowToContainReferenceId: true, 
            emitEvents: false 
        })

        nodes.forEach((node) => sortedList.addContact(new Contact(node.getLocalPeerDescriptor())))

        const closest = sortedList.getAllContacts()

        logger.info('Nodes sorted according to distance to data are: ')
        closest.forEach((contact) => {
            logger.info(getNodeIdFromPeerDescriptor(contact.getPeerDescriptor()))
        })

        logger.info('storing data to node 0')
        const successfulStorers = await nodes[0].storeDataToDht(DATA_KEY.value, DATA_VALUE)
        expect(successfulStorers.length).toBe(1)
        logger.info('data successfully stored to node 0')

        logger.info('Nodes sorted according to distance to data with storing nodes marked are: ')

        closest.forEach((contact) => {
            const node = nodesById.get(getNodeIdFromPeerDescriptor(contact.getPeerDescriptor()))!
            let hasDataMarker = ''
            
            if (hasData(node)) {
                hasDataMarker = '<-'
            }

            // eslint-disable-next-line max-len
            logger.info(getNodeIdFromPeerDescriptor(contact.getPeerDescriptor()) + ' ' + getNodeIdFromPeerDescriptor(node.getLocalPeerDescriptor()) + hasDataMarker)
        })

        logger.info(NUM_NODES + ' nodes joining layer0 DHT')
        await Promise.all(
            nodes.map(async (node, i) => {
                if (i !== 0) {
                    await node.joinDht([entryPoint.getLocalPeerDescriptor()])
                }
            })
        )

        logger.info('completed ' + NUM_NODES + ' nodes joining layer0 DHT')

        await waitNodesReadyForTesting(nodes)

        logger.info('After join of 99 nodes: nodes sorted according to distance to data with storing nodes marked are: ')

        closest.forEach((contact) => {
            const node = nodesById.get(getNodeIdFromPeerDescriptor(contact.getPeerDescriptor()))!
            let hasDataMarker = ''
            if (hasData(node)) {
                hasDataMarker = ' <-'
            }
            logger.info(getNodeIdFromPeerDescriptor(node.getLocalPeerDescriptor()) + hasDataMarker)
        })

        const closestNode = nodesById.get(getNodeIdFromPeerDescriptor(closest[0].getPeerDescriptor()))!

        // TODO assert the content?
        expect(hasData(closestNode)).toBe(true)
    }, 180000)

    it('Data replicates to the last remaining node if all other nodes leave gracefully', async () => {
        logger.info(NUM_NODES + ' nodes joining layer0 DHT')
        await Promise.all(nodes.map((node) => node.joinDht([entryPoint.getLocalPeerDescriptor()])))

        logger.info('completed ' + NUM_NODES + ' nodes joining layer0 DHT')

        await waitNodesReadyForTesting(nodes)

        const randomIndex = Math.floor(Math.random() * nodes.length)
        logger.info('storing data to a random node: ' + randomIndex)

        const successfulStorers = await nodes[randomIndex].storeDataToDht(DATA_KEY.value, DATA_VALUE)

        logger.info('data successfully stored to ' 
            + successfulStorers.map((peerDescriptor) => getNodeIdFromPeerDescriptor(peerDescriptor)).join() + ' nodes')

        const randomIndices = []
        for (let i = 0; i < nodes.length; i++) {
            randomIndices.push(i)
        }
        logger.info('Random indices: ' + randomIndices.map((i) => i.toString()).join())
        while (randomIndices.length > 1) {
            const index = Math.floor(Math.random() * randomIndices.length)
            const nodeIndex = randomIndices[index]
            randomIndices.splice(index, 1)
            logger.info('Stopping node ' + nodeIndex, { hasData: hasData(nodes[nodeIndex]) })
            await nodes[nodeIndex].stop()
        }

        logger.info('after random graceful leaving, node ' + randomIndices[0] + ' is left')

        logger.info('data of ' + randomIndices[0] + ' was ' + JSON.stringify(getDataValues(nodes[randomIndices[0]])))

        // TODO assert the content?
        expect(hasData(nodes[randomIndices[0]])).toBe(true)

    }, 180000)
})
