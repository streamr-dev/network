/* eslint-disable no-console */
import { LatencyType, Simulator } from '../../src/connection/Simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockConnectionDhtNode } from '../utils'
import { execSync } from 'child_process'
import fs from 'fs'
import { Logger } from '@streamr/utils'
import { debugVars } from '../../src/helpers/debugHelpers'
import { PeerID } from '../../src/exports'
import { Any } from '../../src/proto/google/protobuf/any'

const logger = new Logger(module)

describe('Storing data in DHT', () => {
    let entryPoint: DhtNode
    let nodes: DhtNode[]
    let entrypointDescriptor: PeerDescriptor
    const simulator = new Simulator(LatencyType.NONE)
    const NUM_NODES = 100
    const MAX_CONNECTIONS = 20
    const K = 2

    const nodeIndicesById: Record<string, number> = {}

    if (!fs.existsSync('test/data/nodeids.json')) {
        console.log('ground truth data does not exist yet, generating..')
        execSync("npm run prepare-kademlia-simulation")
    }

    const dhtIds: Array<{ type: string, data: Array<number> }> = JSON.parse(fs.readFileSync('test/data/nodeids.json').toString())

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
            entryPoint.stop(),
            ...nodes.map(async (node) => await node.stop())
        ])
    })

    it('Data structures work locally', async () => {
        logger.info(NUM_NODES + ' nodes joining layer0 DHT')
        await entryPoint.joinDht(entrypointDescriptor)

        await Promise.all(
            nodes.map((node) => node.joinDht(entrypointDescriptor))
        )

        logger.info('completed ' + NUM_NODES + ' nodes joining layer0 DHT')

        debugVars['waiting'] = true

        logger.info('doing waitReadyForTesting() for nodes')

        nodes.forEach((node) => node.garbageCollectConnections())
        entryPoint.garbageCollectConnections()

        await Promise.all(nodes.map((node) => node.waitReadyForTesting()))

        logger.info('doing waitReadyForTesting() for entrypoint')

        await entryPoint.waitReadyForTesting()

        debugVars['waiting'] = false
        logger.info('waiting waitReadyForTesting() over')

        const node = entryPoint
        logger.info(node.getNodeName() + ': connections:' +
            node.getNumberOfConnections() + ', kbucket: ' + node.getBucketSize()
            + ', localLocked: ' + node.getNumberOfLocalLockedConnections()
            + ', remoteLocked: ' + node.getNumberOfRemoteLockedConnections()
            + ', weakLocked: ' + node.getNumberOfWeakLockedConnections())

        const storingNodeIndex = 34
        const dataKey = PeerID.fromString('3232323e12r31r3')
        const data = Any.pack(entrypointDescriptor, PeerDescriptor)

        logger.info('node ' + storingNodeIndex + ' starting to store data with key ' + dataKey.toString())
        await nodes[storingNodeIndex].storeData(PeerID.fromValue(nodes[storingNodeIndex].getPeerDescriptor().kademliaId), dataKey, data)
        logger.info('store data over')

        logger.info('node ' + storingNodeIndex + ' starting to get data with key ' + dataKey.toString())
        const fetchedData = await nodes[storingNodeIndex].getData(dataKey)
        logger.info('getData over')

        fetchedData.forEach((value) => {
            const fetchedDescriptor = Any.unpack(value, PeerDescriptor)
            logger.info(JSON.stringify(fetchedDescriptor))
        })

    }, 180000)
})
