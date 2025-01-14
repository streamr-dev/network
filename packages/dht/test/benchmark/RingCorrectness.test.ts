/* eslint-disable no-console */
import { Simulator } from '../../src/connection/simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { createMockRingNode } from '../utils/utils'
import { execSync } from 'child_process'
import fs from 'fs'
import { DhtAddress, toDhtAddress, toNodeId } from '../../src/identifiers'
import { Logger } from '@streamr/utils'
import { getRingIdRawFromPeerDescriptor } from '../../src/dht/contact/ringIdentifiers'

const logger = new Logger(module)

describe('Ring correctness', () => {
    let entryPoint: DhtNode
    let nodes: DhtNode[]
    const simulator = new Simulator()

    const NUM_NODES = 900
    const nodeIndicesById: Record<DhtAddress, number> = {}

    const regions: number[] = []
    for (let i = 0; i < NUM_NODES + 1; i++) {
        regions.push(i)
    }

    // Shuffle the regions
    for (let i = regions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const temp = regions[i]
        regions[i] = regions[j]
        regions[j] = temp
    }

    if (!fs.existsSync('test/data/nodeids.json')) {
        console.log('gound truth data does not exist yet, generating..')
        execSync('npm run prepare-kademlia-simulation')
    }

    const dhtIds: { type: string; data: number[] }[] = JSON.parse(fs.readFileSync('test/data/nodeids.json').toString())
    const groundTruth: Record<string, { name: string; distance: number; id: { type: string; data: number[] } }[]> =
        JSON.parse(fs.readFileSync('test/data/orderedneighbors.json').toString())

    beforeEach(async () => {
        jest.setTimeout(60000)
        nodes = []
        entryPoint = await createMockRingNode(simulator, toDhtAddress(Uint8Array.from(dhtIds[0].data)), regions[0])
        nodes.push(entryPoint)
        nodeIndicesById[entryPoint.getNodeId()] = 0

        for (let i = 1; i < NUM_NODES; i++) {
            const node = await createMockRingNode(
                simulator,
                toDhtAddress(Uint8Array.from(dhtIds[i].data)),
                regions[i + 1]
            )
            nodeIndicesById[node.getNodeId()] = i
            nodes.push(node)
        }
    })

    afterEach(async () => {
        await Promise.all([entryPoint.stop(), ...nodes.map((node) => node.stop())])
    })

    it('Can find correct neighbors', async () => {
        await entryPoint.joinDht([entryPoint.getLocalPeerDescriptor()])

        //await Promise.all(
        //    nodes.map((node) => node.joinDht([entryPoint.getLocalPeerDescriptor()]))
        //)

        for (let i = 1; i < NUM_NODES; i++) {
            // time to join the network
            const startTimestamp = Date.now()
            await nodes[i].joinDht([entryPoint.getLocalPeerDescriptor()])
            const endTimestamp = Date.now()
            logger.info('Node ' + i + ' joined in ' + (endTimestamp - startTimestamp) + ' ms')
            const ringStartTimestamp = Date.now()
            await nodes[i].joinRing()
            const ringEndTimestamp = Date.now()
            logger.info('Node ' + i + ' joined ring in ' + (ringEndTimestamp - ringStartTimestamp) + ' ms')
        }

        /*
        for (let i = 1; i < NUM_NODES; i++) {
            // time to join the network
            const ringStartTimestamp = Date.now()
            await nodes[i].joinRing()
            const ringEndTimestamp = Date.now()
            logger.info('Node ' + i + ' joined ring in ' + (ringEndTimestamp - ringStartTimestamp) + ' ms')  
        }*/

        for (let i = 1; i < NUM_NODES; i++) {
            logger.info(
                'Node ' +
                    i +
                    ', own region: ' +
                    nodes[i].getLocalPeerDescriptor().region +
                    '. Regions of closest ring peers, left: ' +
                    nodes[i]
                        .getClosestRingContactsTo(getRingIdRawFromPeerDescriptor(nodes[i].getLocalPeerDescriptor()), 10)
                        .left.map((p) => p.region) +
                    ', right: ' +
                    nodes[i]
                        .getClosestRingContactsTo(getRingIdRawFromPeerDescriptor(nodes[i].getLocalPeerDescriptor()), 10)
                        .right.map((p) => p.region)
            )
        }

        let minimumCorrectNeighbors = Number.MAX_SAFE_INTEGER
        let sumCorrectNeighbors = 0
        let sumKbucketSize = 1

        for (let i = nodes.length - 1; i >= 0; i--) {
            let groundTruthString = 'groundTruthNeighb: '
            // eslint-disable-next-line @typescript-eslint/prefer-for-of
            for (let j = 0; j < groundTruth[i + ''].length; j++) {
                groundTruthString += groundTruth[i + ''][j].name + ','
            }

            const kademliaNeighbors = nodes[i].getClosestContacts(8).map((p) => toNodeId(p))

            let kadString = 'kademliaNeighbors: '
            kademliaNeighbors.forEach((neighbor) => {
                kadString += nodeIndicesById[neighbor] + ','
            })

            let correctNeighbors = 0
            try {
                for (let j = 0; j < groundTruth[i + ''].length; j++) {
                    if (groundTruth[i + ''][j].name != nodeIndicesById[kademliaNeighbors[j]] + '') {
                        break
                    }
                    correctNeighbors++
                }
            } catch {
                console.error(
                    'Node ' +
                        toNodeId(nodes[i].getLocalPeerDescriptor()) +
                        ' had only ' +
                        kademliaNeighbors.length +
                        ' kademlia neighbors'
                )
            }
            if (correctNeighbors === 0) {
                console.log('No correct neighbors found for node ' + i)
                console.log(groundTruthString)
                console.log(kadString)
            }
            if (correctNeighbors < minimumCorrectNeighbors) {
                console.log('NEW MIN', i, correctNeighbors)
                minimumCorrectNeighbors = correctNeighbors
            }

            if (i > 0) {
                sumKbucketSize += nodes[i].getNeighborCount()
                sumCorrectNeighbors += correctNeighbors
            }
        }

        const avgKbucketSize = sumKbucketSize / (NUM_NODES - 1)
        const avgCorrectNeighbors = sumCorrectNeighbors / (NUM_NODES - 1)

        console.log('----------- Simulation results ------------------')
        console.log('Minimum correct neighbors: ' + minimumCorrectNeighbors)
        console.log('Average correct neighbors: ' + avgCorrectNeighbors)
        console.log('Average Kbucket size: ' + avgKbucketSize)
    }, 240000)
})
