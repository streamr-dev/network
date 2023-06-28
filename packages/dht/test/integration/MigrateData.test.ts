/* eslint-disable no-console */
import { LatencyType, Simulator } from '../../src/connection/Simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockConnectionDhtNode, waitNodesReadyForTesting } from '../utils/utils'
import { execSync } from 'child_process'
import fs from 'fs'
import { Logger } from '@streamr/utils'
import { PeerID } from '../../src/exports'
import { Any } from '../../src/proto/google/protobuf/any'
import { SortedContactList } from '../../src/dht/contact/SortedContactList'
import { Contact } from '../../src/dht/contact/Contact'

const logger = new Logger(module)

jest.setTimeout(60000)

describe('Migrating data from node to node in DHT', () => {
    let entryPoint: DhtNode
    let nodes: DhtNode[]
    let entrypointDescriptor: PeerDescriptor
    const simulator = new Simulator(LatencyType.FIXED, 20)
    const NUM_NODES = 100
    const MAX_CONNECTIONS = 80
    const K = 8

    const nodesById: Map<string, DhtNode> = new Map()

    if (!fs.existsSync('test/data/nodeids.json')) {
        console.log('ground truth data does not exist yet, generating..')
        execSync("npm run prepare-kademlia-simulation")
    }

    const dhtIds: Array<{ type: string, data: Array<number> }> = JSON.parse(fs.readFileSync('test/data/nodeids.json').toString())
    /*
    const getRandomNode = () => {
        return nodes[Math.floor(Math.random() * nodes.length)]
    }
    */
    beforeEach(async () => {
        nodes = []
        const entryPointId = '0'
        entryPoint = await createMockConnectionDhtNode(entryPointId, simulator,
            Uint8Array.from(dhtIds[0].data), K, entryPointId, MAX_CONNECTIONS)
        nodes.push(entryPoint)
        nodesById.set(entryPoint.getNodeId().toKey(), entryPoint)

        entrypointDescriptor = {
            kademliaId: entryPoint.getNodeId().value,
            type: NodeType.NODEJS,
            nodeName: entryPointId
        }

        nodes.push(entryPoint)

        for (let i = 1; i < NUM_NODES; i++) {
            const nodeId = `${i}`

            const node = await createMockConnectionDhtNode(nodeId, simulator,
                Uint8Array.from(dhtIds[i].data), K, nodeId, MAX_CONNECTIONS)
            nodesById.set(node.getNodeId().toKey(), node)
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

    it('Data migrates to the closest node no matter where it is stored', async () => {
        const dataKey = PeerID.fromString('3232323e12r31r3')
        const data = Any.pack(entrypointDescriptor, PeerDescriptor)

        // calculate offline which node is closest to the data

        const sortedList = new SortedContactList<Contact>(dataKey, 10000)

        nodes.forEach((node) => {
            sortedList.addContact(new Contact(node.getPeerDescriptor())
            )
        })

        const closest = sortedList.getAllContacts()

        logger.info('Nodes sorted according to distance to data are: ')
        closest.forEach((contact) => {
            logger.info('' + contact.getPeerDescriptor().nodeName)
        })

        logger.info('node 0 joining to the DHT')

        await nodes[0].joinDht(entrypointDescriptor)

        logger.info('storing data to node 0')
        const successfulStorers = await nodes[0].storeDataToDht(dataKey.value, data)
        expect(successfulStorers.length).toBe(1)
        logger.info('data successfully stored to node 0')

        logger.info('Nodes sorted according to distance to data with storing nodes marked are: ')

        closest.forEach((contact) => {
            const node = nodesById.get(PeerID.fromValue(contact.getPeerDescriptor().kademliaId).toKey())!
            let hasDataMarker = ''
            
            // @ts-expect-error private field
            if (node.localDataStore.getEntry(dataKey)) {
                hasDataMarker = '<-'
            }

            logger.info(contact.getPeerDescriptor().nodeName + ' ' + node.getNodeName() + hasDataMarker)
        })

        logger.info(NUM_NODES + ' nodes joining layer0 DHT')
        await Promise.all(
            nodes.map((node) => {
                if (node.getNodeName() != '0') {
                    node.joinDht(entrypointDescriptor)
                }
            })
        )

        logger.info('completed ' + NUM_NODES + ' nodes joining layer0 DHT')

        await waitNodesReadyForTesting(nodes)

        logger.info('After join of 99 nodes: nodes sorted according to distance to data with storing nodes marked are: ')

        closest.forEach((contact) => {
            const node = nodesById.get(PeerID.fromValue(contact.getPeerDescriptor().kademliaId).toKey())!
            let hasDataMarker = ''

            // @ts-expect-error private field

            if (node.localDataStore.getEntry(dataKey)) {
                hasDataMarker = '<-'
            }

            logger.info('' + node.getNodeName() + hasDataMarker)
        })

        const closestNode = nodesById.get(PeerID.fromValue(closest[0].getPeerDescriptor().kademliaId).toKey())!

        // @ts-expect-error private field
        expect(closestNode.localDataStore.getEntry(dataKey)).toBeTruthy()
    }, 180000)

    it('Data migrates to the last remaining node if all other nodes leave gracefully', async () => {
        const dataKey = PeerID.fromString('3232323e12r31r3')
        const data = Any.pack(entrypointDescriptor, PeerDescriptor)

        logger.info(NUM_NODES + ' nodes joining layer0 DHT')
        await Promise.all(
            nodes.map((node) => {
                node.joinDht(entrypointDescriptor)
            })
        )

        logger.info('completed ' + NUM_NODES + ' nodes joining layer0 DHT')

        await waitNodesReadyForTesting(nodes)

        const randomIndex = Math.floor(Math.random() * nodes.length)
        logger.info('storing data to a random node: ' + randomIndex)

        const successfulStorers = await nodes[randomIndex].storeDataToDht(dataKey.value, data)

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

            logger.info('Stopping node ' + nodeIndex + ' ' +
                // @ts-expect-error private field
                (nodes[nodeIndex].localDataStore.getEntry(dataKey) ? ', has data' : ' does not have data'))

            await nodes[nodeIndex].stop()
        }

        logger.info('after random graceful leaving, node ' + randomIndices[0] + ' is left')

        // @ts-expect-error private field
        logger.info('data of ' + randomIndices[0] + ' was ' + nodes[randomIndices[0]].localDataStore.getEntry(dataKey))

        // @ts-expect-error private field
        expect(nodes[randomIndices[0]].localDataStore.getEntry(dataKey)).toBeTruthy()

    }, 180000)
})
