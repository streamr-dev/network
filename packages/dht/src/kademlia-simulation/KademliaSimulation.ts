/* eslint-disable no-console */

import { SimulationNode } from './SimulationNode'
import fs from 'fs'
import { PeerID } from '../helpers/PeerID'

export class KademliaSimulation {
    
    private static readonly NUM_NODES = 1000
    private static readonly ID_LENGTH = 8

    private readonly nodeNamesById: Record<string, number> = {} 
    private readonly nodes: SimulationNode[] = []

    private readonly dhtIds: Array<{ type: string, data: Array<number> }>
    private readonly groundTruth:  Record<string, Array<{ name: string, distance: number, id: { type: string, data: Array<number> } }>>

    constructor() {
        if (!fs.existsSync('test/data/nodeids.json')) {
            throw ('Cannot find test/data/nodeids.json, please run "npm run prepare-kademlia-simulation first"')
        }
        this.dhtIds = JSON.parse(fs.readFileSync('test/data/nodeids.json').toString())
        this.groundTruth = JSON.parse(fs.readFileSync('test/data/orderedneighbors.json').toString())
    }

    public run(): void {
        for (let i = 0; i < KademliaSimulation.NUM_NODES; i++) {
            const node = new SimulationNode(PeerID.fromValue(Buffer.from(this.dhtIds[i].data.slice(0, KademliaSimulation.ID_LENGTH))))
            this.nodeNamesById[JSON.stringify(node.getContact().id)] = i
            this.nodes.push(node)
            node.joinDht(this.nodes[0])
           
            process.stdout.write('.')
        }

        let minimumCorrectNeighbors = Number.MAX_SAFE_INTEGER
        
        let sumCorrectNeighbors = 0
        let sumKbucketSize = 1
        let sumOutgoingRpcCalls = 0
        let maxOutgoingRpcCalls = 0

        for (let i = this.nodes.length - 1; i >= 0; i--) {
            
            const numberOfOutgoingRpcCalls = this.nodes[i].getNumberOfOutgoingRpcCalls()
            console.log('-----------')
            console.log('Node: ' + i)
            console.log('Kbucket size: ' + this.nodes[i].getKBucketSize())
            console.log('Num incoming RPC calls: ' + this.nodes[i].getNumberOfIncomingRpcCalls())
            console.log('Num outgoing RPC calls: ' + numberOfOutgoingRpcCalls)
    
            sumOutgoingRpcCalls += numberOfOutgoingRpcCalls
    
            if (maxOutgoingRpcCalls < numberOfOutgoingRpcCalls) {
                maxOutgoingRpcCalls = numberOfOutgoingRpcCalls
            }

            const kademliaNeighbors = this.nodes[i].getNeightborList().getContactIds()

            let correctNeighbors = 0
            for (let j = 0; j < this.groundTruth[i + ''].length; j++) {
                if (this.groundTruth[i + ''][j].name !=  (this.nodeNamesById[JSON.stringify(kademliaNeighbors[j])] + '')) {
                    break
                }
                correctNeighbors++
            }

            if (correctNeighbors < minimumCorrectNeighbors) {
                minimumCorrectNeighbors = correctNeighbors
            }

            console.log('Correct neighbors: ' + correctNeighbors)

            if (i > 0) {                
                sumKbucketSize += this.nodes[i].getKBucketSize()
                sumCorrectNeighbors += correctNeighbors
            }
        }

        const avgCorrectNeighbors = sumCorrectNeighbors / (KademliaSimulation.NUM_NODES - 1)
        const avgKbucketSize = sumKbucketSize / (KademliaSimulation.NUM_NODES - 1)
        const avgNumberOfOutgoingRpcCalls = sumOutgoingRpcCalls / (KademliaSimulation.NUM_NODES - 1)

        console.log('----------- Simulation results ------------------')
        console.log('Minimum correct neighbors: ' + minimumCorrectNeighbors)
        console.log('Average correct neighbors: ' + avgCorrectNeighbors)
        console.log('Average Kbucket size: ' + avgKbucketSize)
        console.log('Average number of outgoing RPC calls: ' + avgNumberOfOutgoingRpcCalls)
        console.log('MAX number of outgoing RPC calls: ' + maxOutgoingRpcCalls)
    }
}

const simulation = new KademliaSimulation()
simulation.run()
