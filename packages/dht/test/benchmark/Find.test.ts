/* eslint-disable no-console */
import { LatencyType, Simulator } from '../../src/connection/simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { createMockConnectionDhtNode } from '../utils/utils'
import { execSync } from 'child_process'
import fs from 'fs'
import { Logger, wait } from '@streamr/utils'
import { debugVars } from '../../src/helpers/debugHelpers'
import { toDhtAddress, toNodeId } from '../../src/identifiers'

const logger = new Logger(module)

describe('Find correctness', () => {
    let entryPoint: DhtNode
    let nodes: DhtNode[]
    const simulator = new Simulator(LatencyType.NONE)
    const NUM_NODES = 1000

    if (!fs.existsSync('test/data/nodeids.json')) {
        console.log('ground truth data does not exist yet, generating..')
        execSync('npm run prepare-kademlia-simulation')
    }

    const dhtIds: { type: string; data: number[] }[] = JSON.parse(fs.readFileSync('test/data/nodeids.json').toString())

    beforeEach(async () => {
        nodes = []
        entryPoint = await createMockConnectionDhtNode(
            simulator,
            toDhtAddress(Uint8Array.from(dhtIds[0].data)),
            undefined
        )

        for (let i = 1; i < NUM_NODES; i++) {
            const node = await createMockConnectionDhtNode(
                simulator,
                toDhtAddress(Uint8Array.from(dhtIds[i].data)),
                undefined
            )
            nodes.push(node)
        }
    })

    afterEach(async () => {
        await Promise.all([entryPoint.stop(), ...nodes.map(async (node) => await node.stop())])
    })

    it('Entrypoint can find a node from the network (exact match)', async () => {
        await entryPoint.joinDht([entryPoint.getLocalPeerDescriptor()])

        await Promise.all(nodes.map((node) => node.joinDht([entryPoint.getLocalPeerDescriptor()])))

        logger.info('waiting 120s')
        debugVars.waiting = true

        await wait(120000)
        debugVars.waiting = false
        logger.info('waiting over')

        nodes.forEach((node) =>
            logger.info(
                toNodeId(node.getLocalPeerDescriptor()) +
                    ': connections:' +
                    node.getConnectionsView().getConnectionCount() +
                    ', kbucket: ' +
                    node.getNeighborCount() +
                    ', localLocked: ' +
                    node.getLocalLockedConnectionCount() +
                    ', remoteLocked: ' +
                    node.getRemoteLockedConnectionCount() +
                    ', weakLocked: ' +
                    node.getWeakLockedConnectionCount()
            )
        )

        logger.info('starting find')
        const targetId = Uint8Array.from(dhtIds[9].data)
        const closestNodes = await nodes[159].findClosestNodesFromDht(toDhtAddress(targetId))
        logger.info('find over')
        expect(closestNodes).toBeGreaterThanOrEqual(5)
        expect(toDhtAddress(targetId)).toEqual(toNodeId(closestNodes[0]))
    }, 180000)
})
