/* eslint-disable no-console */
import { LatencyType, Simulator } from '../../src/connection/Simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockConnectionDhtNode } from '../utils'
import { execSync } from 'child_process'
import fs from 'fs'
import { PeerID, peerIdFromPeerDescriptor } from '../../src/exports'
import { Logger, wait } from '@streamr/utils'
import { debugVars } from '../../src/helpers/debugHelpers'

const logger = new Logger(module)

describe('Recursive find correctness', () => {
    let entryPoint: DhtNode
    let nodes: DhtNode[]
    let entrypointDescriptor: PeerDescriptor
    const simulator = new Simulator(LatencyType.NONE)
    const NUM_NODES = 1000

    const nodeIndicesById: Record<string, number> = {}

    if (!fs.existsSync('test/data/nodeids.json')) {
        console.log('ground truth data does not exist yet, generating..')
        execSync("npm run prepare-kademlia-simulation")
    }

    const dhtIds: Array<{ type: string, data: Array<number> }> = JSON.parse(fs.readFileSync('test/data/nodeids.json').toString())

    beforeEach(async () => {

        nodes = []
        const entryPointId = '0'
        entryPoint = await createMockConnectionDhtNode(entryPointId, simulator, Uint8Array.from(dhtIds[0].data), undefined, entryPointId)
        nodes.push(entryPoint)
        nodeIndicesById[entryPoint.getNodeId().toKey()] = 0
        entrypointDescriptor = {
            kademliaId: entryPoint.getNodeId().value,
            type: NodeType.NODEJS,
            nodeName: entryPointId
        }

        for (let i = 1; i < NUM_NODES; i++) {
            const nodeId = `${i}`

            const node = await createMockConnectionDhtNode(nodeId, simulator, Uint8Array.from(dhtIds[i].data), undefined, nodeId)
            nodeIndicesById[node.getNodeId().toKey()] = i
            nodes.push(node)
        }
    })

    afterEach(async () => {
        await Promise.all([
            entryPoint.stop(),
            ...nodes.map(async (node) => await node.stop())
        ])
    })

    it('Entrypoint can find a node from the network (exact match)', async () => {
        await entryPoint.joinDht(entrypointDescriptor)

        await Promise.all(
            nodes.map((node) => node.joinDht(entrypointDescriptor))
        )

        logger.info('waiting 120s')
        debugVars['waiting'] = true

        await wait(120000)
        debugVars['waiting'] = false
        logger.info('waiting over')

        nodes.forEach((node) => logger.info(node.getNodeName() + ': connections:' +
            node.getNumberOfConnections() + ', kbucket: ' + node.getBucketSize()
            + ', localLocked: ' + node.getNumberOfLocalLockedConnections()
            + ', remoteLocked: ' + node.getNumberOfRemoteLockedConnections()
            + ', weakLocked: ' + node.getNumberOfWeakLockedConnections()))

        logger.info('starting recursive find')
        const kademliaIdToFind = Uint8Array.from(dhtIds[9].data)
        const results = await nodes[159].startRecursiveFind(kademliaIdToFind)
        logger.info('recursive find over')
        expect(results.closestNodes).toBeGreaterThanOrEqual(5)
        expect(PeerID.fromValue(kademliaIdToFind).equals(peerIdFromPeerDescriptor(results.closestNodes[0])))

    }, 180000)
})
