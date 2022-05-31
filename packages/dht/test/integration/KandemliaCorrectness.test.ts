import { Simulator } from '../../src/connection/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { PeerDescriptor } from '../../src/proto/DhtRpc'
import { createMockConnectionDhtNode } from '../utils'
import { execSync } from 'child_process'
import fs from 'fs'

describe('Kademlia correctness', () => {
    let entryPoint: DhtNode
    let nodes: DhtNode[]
    let entrypointDescriptor: PeerDescriptor
    const simulator = new Simulator()
    const NUM_NODES = 1000

    const nodeIndicesById: { [id: string]: number } = {}

    if (!fs.existsSync('test/simulation/data/nodeids.json')) {
        console.log('gound truth data does not exist yet, generating..')
        execSync("npm run prepare-dht-simulation")
    }

    const dhtIds: Array<{ type: string, data: Array<number> }> = JSON.parse(fs.readFileSync('test/simulation/data/nodeids.json').toString())
    const groundTruth: { [nodeName: string]: Array<{ name: string, distance: number, id: { type: string, data: Array<number> } }> } 
        = JSON.parse(fs.readFileSync('test/simulation/data/orderedneighbors.json').toString())

    beforeEach(async () => {

        nodes = []
        const entryPointId = '0'
        entryPoint = await createMockConnectionDhtNode(entryPointId, simulator, Uint8Array.from(dhtIds[0].data))
        nodes.push(entryPoint)
        nodeIndicesById[JSON.stringify(entryPoint.getNodeId().value)] = 0
        entrypointDescriptor = {
            peerId: entryPoint.getNodeId().value,
            type: 0
        }

        for (let i = 1; i < NUM_NODES; i++) {
            const nodeId = `${i}`

            const node = await createMockConnectionDhtNode(nodeId, simulator, Uint8Array.from(dhtIds[i].data))
            nodeIndicesById[JSON.stringify(node.getNodeId().value)] = i
            nodes.push(node)
        }
    })

    afterEach(async () => {
        await Promise.all([
            entryPoint.stop(),
            ...nodes.map(async (node) => await node.stop())
        ])
    })

    it('Can find correct neighbors', async () => {
        await entryPoint.joinDht(entrypointDescriptor)
        await Promise.allSettled(
            nodes.map((node) => node.joinDht(entrypointDescriptor))
        )
        /*
        nodes.forEach((node) => {
            expect(node.getBucketSize()).toBeGreaterThanOrEqual(node.getK())
            expect(node.getNeighborList().getSize()).toBeGreaterThanOrEqual(node.getK() * 2)
        })
        expect(entryPoint.getBucketSize()).toBeGreaterThanOrEqual(entryPoint.getK())
        */

        let minimumCorrectNeighbors = Number.MAX_SAFE_INTEGER

        let sumCorrectNeighbors = 0
        //let sumKbucketSize = 1

        for (let i = nodes.length - 1; i >= 0; i--) {

            console.log('-----------')
            console.log('Node: ' + i)
            /*
            console.log('Kbucket size: '+ nodes[i].getKBucketSize())
            console.log('Num incoming RPC calls: '+ nodes[i].getNumberOfIncomingRpcCalls())
            console.log('Num outgoing RPC calls: '+ nodes[i].getNumberOfOutgoingRpcCalls())
            */

            let groundTruthString = 'groundTruthNeighb: '
            for (let j = 0; j < groundTruth[i + ''].length; j++) {
                groundTruthString += groundTruth[i + ''][j].name + ','
            }

            console.log(groundTruthString)

            const kademliaNeighbors = nodes[i].getNeighborList().getContactIds()

            let kadString = 'kademliaNeighbors: '
            kademliaNeighbors.forEach((neighbor) => {
                kadString += nodeIndicesById[JSON.stringify(neighbor.value)] + ','
            })

            console.log(kadString)

            let correctNeighbors = 0
            for (let j = 0; j < groundTruth[i + ''].length; j++) {
                if (groundTruth[i + ''][j].name != (nodeIndicesById[JSON.stringify(kademliaNeighbors[j].value)] + '')) {
                    break
                }
                correctNeighbors++
            }

            if (correctNeighbors < minimumCorrectNeighbors) {
                minimumCorrectNeighbors = correctNeighbors
            }

            console.log('Correct neighbors: ' + correctNeighbors)

            if (i > 0) {
                //sumKbucketSize += nodes[i].getKBucketSize()
                sumCorrectNeighbors += correctNeighbors
            }

            //const avgKbucketSize = sumKbucketSize / (NUM_NODES - 1)
            const avgCorrectNeighbors = sumCorrectNeighbors / (NUM_NODES - 1)

            console.log('----------- Simulation results ------------------')
            console.log('Minimum correct neighbors: ' + minimumCorrectNeighbors)
            console.log('Average correct neighbors: ' + avgCorrectNeighbors)
            //console.log('Average Kbucket size: ' + avgKbucketSize)
        }
    })
})