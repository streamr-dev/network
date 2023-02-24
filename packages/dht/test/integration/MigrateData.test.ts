/* eslint-disable no-console */
import { LatencyType, Simulator } from '../../src/connection/Simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockConnectionDhtNode } from '../utils'
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
    const simulator = new Simulator(LatencyType.RANDOM)
    const NUM_NODES = 100
    const MAX_CONNECTIONS = 20
    const K = 2

    const nodeIndicesById: Record<string, number> = {}

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
                Uint8Array.from(dhtIds[i].data), K, nodeId, MAX_CONNECTIONS)
            nodeIndicesById[node.getNodeId().toKey()] = i
            nodes.push(node)
        }
    })

    afterEach(async () => {
        await Promise.allSettled([
            ...nodes.map(async (node) => await node.stop())
        ])
    })

    it('Data migrates to the closest node no matter where it is stored', async () => {
        //const storingNode = getRandomNode()
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
        expect(successfulStorers).toBe(1)
        logger.info('data successfully stored to node 0')
        

        logger.info('Nodes sorted according to distance to data with storing nodes marked are: ')
        
        closest.forEach((contact) => {
            const node = nodes[nodeIndicesById[PeerID.fromValue(contact.getPeerDescriptor().kademliaId).toKey()]]
            let hasDataMarker = ''

            if (node.doGetData(dataKey)) {
                hasDataMarker = '<-'
            }

            logger.info('' + node.getNodeName() + hasDataMarker)
        })

        /*
        logger.info('node ' + storingNode.getNodeName() + ' starting to store data with key ' + dataKey.toString())
        const successfulStorers = await storingNode.storeDataToDht(dataKey.value, data)

        expect(successfulStorers.length).toBeGreaterThan(4)

        logger.info('store data over')

        logger.info(NUM_NODES + ' nodes joining layer0 DHT')
        await Promise.all(
            nodes.map((node) => node.joinDht(entrypointDescriptor))
        )
        logger.info('completed ' + NUM_NODES + ' nodes joining layer0 DHT')

        await waitNodesReadyForTesting(nodes)

        const node = entryPoint
        logger.info(node.getNodeName() + ': connections:' +
            node.getNumberOfConnections() + ', kbucket: ' + node.getBucketSize()
            + ', localLocked: ' + node.getNumberOfLocalLockedConnections()
            + ', remoteLocked: ' + node.getNumberOfRemoteLockedConnections()
            + ', weakLocked: ' + node.getNumberOfWeakLockedConnections())

        const fetchingNode = getRandomNode()
        logger.info('node ' + fetchingNode.getNodeName() + ' starting to get data with key ' + dataKey.toString())
        const results = await fetchingNode.getDataFromDht(dataKey.value)

        logger.info('dataEntries.length: ' + results.dataEntries!.length)
        results.dataEntries?.forEach((entry) => {
            logger.info(JSON.stringify(entry.storer!), Any.unpack(entry.data!, PeerDescriptor))
        })

        const fetchedData = Any.unpack(results.dataEntries![0].data!, PeerDescriptor)

        logger.info('find data over')

        expect(JSON.stringify(fetchedData)).toEqual(JSON.stringify(entrypointDescriptor))
        */
    }, 180000)
})
