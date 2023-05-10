/* eslint-disable no-console */

import { DhtNode } from '../../../src/dht/DhtNode'
import { createMockConnectionDhtNode, waitNodesReadyForTesting } from '../../utils/utils'
import { LatencyType, Simulator } from '../../../src/connection/Simulator/Simulator'
import { performance } from 'perf_hooks'
import { PeerID } from '../../../src/helpers/PeerID'
import fs from 'fs'
import { debugVars } from '../../../src/helpers/debugHelpers'
import { Logger } from '@streamr/utils'
// import { ClientWebSocket } from '../../../src/connection/WebSocket/ClientWebSocket'
//import { ConnectionEvents } from '../../../src/connection/IConnection'

const numNodes = 100000

const logger = new Logger(module)
let nodes: DhtNode[]
let simulator: Simulator
//let clientWebSocket: ClientWebSocket

const prepareNetwork = async () => {
    console.log('Preparing network')
    nodes = []
    simulator = new Simulator(LatencyType.REAL)
    const entryPointId = PeerID.generateRandom()

    const entryPoint = await createMockConnectionDhtNode(entryPointId.toString(), simulator, entryPointId.value)

    await entryPoint.joinDht(entryPoint.getPeerDescriptor())
    nodes.push(entryPoint)

    console.log('Entrypoint ready')

    /*
    clientWebSocket = new ClientWebSocket()

    const promise = waitForEvent3<ConnectionEvents>(clientWebSocket, 'connected')
    clientWebSocket.connect('ws://127.0.0.1:9999')
    await promise
    */
}

const shutdownNetwork = async () => {
    await Promise.all([
        ...nodes.map((node) => node.stop())
    ])
    simulator.stop()
    //await clientWebSocket.close()
}

const measureJoiningTime = async () => {

    const nodeId = PeerID.generateRandom()
    const node = await createMockConnectionDhtNode(nodeId.toString(), simulator, nodeId.value)

    // get random node from network to use as entrypoint
    const randomNode = nodes[Math.floor(Math.random() * nodes.length)]

    const start = performance.now()

    //const startMessage = { type: 'start', start: start }

    // convert message to Uint8Array
    //const startMessageBuffer = new TextEncoder().encode(JSON.stringify(startMessage))

    //clientWebSocket.send(startMessageBuffer)

    await node.joinDht(randomNode.getPeerDescriptor())

    const end = performance.now()

    //const endMessage = { type: 'end', end: end }
    //const endMessageBuffer = new TextEncoder().encode(JSON.stringify(endMessage))
    
    //clientWebSocket.send(endMessageBuffer)

    await waitNodesReadyForTesting([node])
    nodes.push(node)

    return end - start
}

const run = async () => {
    await prepareNetwork()
    const logFile = fs.openSync('JoiningTimeLayer0.log', 'w')

    fs.writeSync(logFile, 'Network size' + '\t' + 'Joining time (ms)' + '\n')

    let lastIntervalAt = performance.now()
    setInterval(() => {
        const cur = performance.now()
        logger.info('A second in milliseconds: ' + (cur - lastIntervalAt))
        lastIntervalAt = cur
    }, 1000)

    for (let i = 0; i < numNodes; i++) {

        const time = await measureJoiningTime()
        const heapUsed = process.memoryUsage().heapUsed / 1024 / 1024
        console.log(`Joining time for ${i + 1} nodes network: ${time}ms`)
        fs.writeSync(logFile, `${i + 1}` + '\t' + `${Math.round(time)}` + '\t' + debugVars['nodesContacted'] +
            '\t' + debugVars['nodesContactedRandom'] + '\t' + debugVars['simulatorHeapSize'] + '\t' + heapUsed + '\n')
        //global.gc!()
    }
    fs.closeSync(logFile)
    await shutdownNetwork()
}

// eslint-disable-next-line promise/catch-or-return
run().then(() => {
    console.log('done')
})
