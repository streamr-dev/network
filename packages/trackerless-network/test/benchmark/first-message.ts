/* eslint-disable no-console */

import { DhtNode, LatencyType, Simulator, getRandomRegion } from '@streamr/dht'
import { MessageID, StreamMessage, StreamMessageType, StreamPartID, StreamPartIDUtils, toStreamID, toStreamPartID } from '@streamr/protocol'
import { hexToBinary, utf8ToBinary, waitForEvent3 } from '@streamr/utils'
import fs from 'fs'
import { PeerDescriptor } from '@streamr/dht'
import { NetworkNode } from '../../src/NetworkNode'
import { getNodeIdFromPeerDescriptor } from '../../src/identifiers'
import { streamPartIdToDataKey } from '../../src/logic/EntryPointDiscovery'
import { createMockPeerDescriptor, createNetworkNodeWithSimulator } from '../utils/utils'
import { ILayer1 } from '../../src/logic/ILayer1'
import { RandomGraphNode } from '../../src/logic/RandomGraphNode'
import { getTestInterface } from '@streamr/test-utils'

const numNodes = 10000

let nodes: NetworkNode[]
let simulator: Simulator
let layer0Ep: PeerDescriptor
const publishIntervals: NodeJS.Timeout[] = []
const streamParts: Map<StreamPartID, NetworkNode> = new Map()
let currentNode: NetworkNode
let publishInterval: NodeJS.Timeout | undefined
let i = 0

const prepareLayer0 = async () => {
    console.log('Preparing network')
    nodes = []
    simulator = new Simulator(LatencyType.REAL)
    const peerDescriptor = createMockPeerDescriptor({
        region: getRandomRegion()
    })
    layer0Ep = peerDescriptor
    const entryPoint = createNetworkNodeWithSimulator(peerDescriptor, simulator, [peerDescriptor])
    await entryPoint.start()    
    nodes.push(entryPoint)

    console.log('Entrypoint ready')
}

const prepareStream = async (streamId: string) => {
    console.log('Preparing stream ')
    const peerDescriptor = createMockPeerDescriptor({
        region: getRandomRegion()
    })
    const streamPartId = toStreamPartID(toStreamID(streamId), 0)
    const streamPublisher = createNetworkNodeWithSimulator(peerDescriptor, simulator, [layer0Ep])
    await streamPublisher.start()
    streamPublisher.join(streamPartId)
    nodes.push(streamPublisher)
    streamParts.set(streamPartId, streamPublisher)
}

const shutdownNetwork = async () => {
    publishIntervals.map((interval) => clearInterval(interval))
    await Promise.all([
        ...nodes.map((node) => node.stop())
    ])
    simulator.stop()
}

const measureJoiningTime = async () => {
    const peerDescriptor = createMockPeerDescriptor({
        region: getRandomRegion()
    })
    console.log('starting node with id ', getNodeIdFromPeerDescriptor(peerDescriptor))

    // start publishing ons stream
    const stream = Array.from(streamParts.keys())[Math.floor(Math.random() * streamParts.size)]
    console.log(stream)
    publishInterval = setInterval(() => {
        i += 1
        const streamMessage = new StreamMessage({
            messageId: new MessageID(
                StreamPartIDUtils.getStreamID(stream),
                0,
                i,
                Math.floor(Math.random() * 20000),
                'node' as any,
                'msgChainId'
            ),
            prevMsgRef: null,
            content: utf8ToBinary(JSON.stringify({
                hello: 'world'
            })),
            messageType: StreamMessageType.MESSAGE,
            signature: hexToBinary('0x1234'),
        })
        streamParts.get(stream)!.broadcast(streamMessage)
    }, 1000)
    // get random node from network to use as entrypoint
    const randomNode = nodes[Math.floor(Math.random() * nodes.length)]
    const streamSubscriber = createNetworkNodeWithSimulator(peerDescriptor, simulator, [randomNode.stack.getLayer0DhtNode().getPeerDescriptor()])
    currentNode = streamSubscriber
    const start = performance.now()
    await streamSubscriber.start()

    await Promise.all([
        waitForEvent3(streamSubscriber.stack.getStreamrNode() as any, 'newMessage', 60000),
        streamSubscriber.join(stream)
    ])

    const end = performance.now()

    nodes.push(streamSubscriber)
    clearInterval(publishInterval)
    publishInterval = undefined
    return end - start
}

const run = async () => {
    Simulator.useFakeTimers()
    await prepareLayer0()
    for (let i = 0; i < 20; i++) {
        await prepareStream(`stream-${i}`)
    }
    const logFile = fs.openSync('FirstMessageTime.log', 'w')
    
    fs.writeSync(logFile, 'Network size' + '\t' + 'Time to receive first message time (ms)' + '\n')
    for (let i = 0; i < numNodes; i++) {
        const time = await measureJoiningTime()
        console.log(`Time to receive first message for ${i + 1} nodes network: ${time}ms`)
        fs.writeSync(logFile, `${i + 1}` + '\t' + `${Math.round(time)}\n`)
    }
    fs.closeSync(logFile)
    await shutdownNetwork()
    Simulator.useFakeTimers(false)
} 

// eslint-disable-next-line promise/catch-or-return, promise/always-return
run().then(() => {
    console.log('done')
}).catch((err) => {
    console.error(err)
    const streamParts = currentNode.stack.getStreamrNode()!.getStreamParts()
    const foundData = nodes[0].stack.getLayer0DhtNode().getDataFromDht(streamPartIdToDataKey(streamParts[0]))
    console.log(foundData)
    console.log(getTestInterface(currentNode.stack.getLayer0DhtNode() as DhtNode).getKBucketPeers().length)
    console.log((currentNode.stack.getLayer0DhtNode() as DhtNode).getNumberOfConnections())
    const streamPartDelivery = currentNode.stack.getStreamrNode().getStreamPartDelivery(streamParts[0])! as { layer1: ILayer1, node: RandomGraphNode }
    console.log(getTestInterface(streamPartDelivery.layer1 as DhtNode).getKBucketPeers())
    console.log(streamPartDelivery.node.getTargetNeighborIds())
    console.log(nodes[nodes.length - 1])
    if (publishInterval) {
        clearInterval(publishInterval)
    }
})
