/* eslint-disable no-console */
import { LatencyType, Simulator } from '../../src/connection/Simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockConnectionDhtNode, waitNodesReadyForTesting } from '../utils'
import { execSync } from 'child_process'
import fs from 'fs'
import { Logger } from '@streamr/utils'
import { PeerID } from '../../src/exports'
import { Any } from '../../src/proto/google/protobuf/any'

const logger = new Logger(module)

jest.setTimeout(60000) 

describe('Storing data in DHT', () => {
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

    const getRandomNode = () => {
        return nodes[Math.floor(Math.random() * nodes.length)]
    }

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
    })

    afterEach(async () => {
        await Promise.allSettled([
            ...nodes.map(async (node) => await node.stop())
        ])
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
        logger.info('getData over')

        fetchedData.forEach((entry) => {
            const fetchedDescriptor = Any.unpack(entry.data!, PeerDescriptor)
            logger.info(JSON.stringify(fetchedDescriptor))
        })

    }, 180000)

    it('Storing data works', async () => {
        const storingNodeIndex = 34
        const dataKey = PeerID.fromString('3232323e12r31r3')
        const data = Any.pack(entrypointDescriptor, PeerDescriptor)

        logger.info('node ' + storingNodeIndex + ' starting to store data with key ' + dataKey.toString())
        const successfulStorers = await nodes[storingNodeIndex].storeDataToDht(dataKey.value, data)
        
        expect(successfulStorers.length).toBeGreaterThan(4)

        logger.info('store data over')
    }, 180000)

    it('Storing and getting data works', async () => {
        const storingNode = getRandomNode()
        const dataKey = PeerID.fromString('3232323e12r31r3')
        const data = Any.pack(entrypointDescriptor, PeerDescriptor)

        logger.info('node ' + storingNode.getNodeName() + ' starting to store data with key ' + dataKey.toString())
        const successfulStorers = await storingNode.storeDataToDht(dataKey.value, data)
        console.log(successfulStorers)
        expect(successfulStorers.length).toBeGreaterThan(4)

        logger.info('store data over')
    
        const fetchingNode = getRandomNode()
        logger.info('node ' + fetchingNode.getNodeName() + ' starting to get data with key ' + dataKey.toString())
        const results = await fetchingNode.getDataFromDht(dataKey.value)

        console.log(results)
        logger.info('dataEntries.length: ' + results.dataEntries!.length)
        results.dataEntries?.forEach((entry) => {
            logger.info(JSON.stringify(entry.storer!), Any.unpack(entry.data!, PeerDescriptor))
        })
        
        const fetchedData = Any.unpack(results.dataEntries![0].data!, PeerDescriptor)

        logger.info('find data over')

        expect(JSON.stringify(fetchedData)).toEqual(JSON.stringify(entrypointDescriptor))
    }, 180000)
})
