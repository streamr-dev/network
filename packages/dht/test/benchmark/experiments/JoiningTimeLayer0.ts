/* eslint-disable no-console */

import { DhtNode } from '../../../src/dht/DhtNode'
import { createMockConnectionDhtNode, waitNodesReadyForTesting } from '../../utils/utils'
import { LatencyType, Simulator } from '../../../src/connection/Simulator/Simulator'
import { performance } from 'perf_hooks'
import { PeerID } from '../../../src/helpers/PeerID'
import fs from 'fs'

const numNodes = 100000

let nodes: DhtNode[]
let simulator: Simulator

const prepareNetwork = async () => {
    console.log('Preparing network')
    nodes = []
    simulator = new Simulator(LatencyType.REAL)
    const entryPointId = PeerID.generateRandom()
    
    const entryPoint = await createMockConnectionDhtNode(entryPointId.toString(), simulator, entryPointId.value)
    
    await entryPoint.joinDht(entryPoint.getPeerDescriptor())
    nodes.push(entryPoint)

    console.log('Entrypoint ready')
}

const shutdownNetwork = async () => {
    await Promise.all([
        ...nodes.map((node) => node.stop())
    ])
    simulator.stop()
}

const measureJoiningTime = async () => {
    
    const nodeId = PeerID.generateRandom()
    const node = await createMockConnectionDhtNode(nodeId.toString(), simulator, nodeId.value)
   
    // get random node from network to use as entrypoint
    const randomNode = nodes[Math.floor(Math.random() * nodes.length)]
    
    const start = performance.now()

    await node.joinDht(randomNode.getPeerDescriptor())
    
    const end = performance.now()
    
    await waitNodesReadyForTesting([node])
    nodes.push(node)

    return end - start
}

const run = async () => {
    await prepareNetwork()
    const logFile = fs.openSync('JoiningTimeLayer0.log', 'w')
    
    fs.writeSync(logFile, 'Network size' + '\t' + 'Joining time (ms)' + '\n')
    for (let i = 0; i < numNodes; i++) {
        
        const time = await measureJoiningTime()
        console.log(`Joining time for ${i + 1} nodes network: ${time}ms`)
        fs.writeSync(logFile, `${i + 1}` + '\t' + `${Math.round(time)}\n`)
    }
    fs.closeSync(logFile)
    await shutdownNetwork()
} 

// eslint-disable-next-line promise/catch-or-return
run().then(() => {
    console.log('done')
})
