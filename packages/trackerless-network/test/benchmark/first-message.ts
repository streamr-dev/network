/* eslint-disable no-console */

import { PeerID, LatencyType, Simulator, getRandomRegion } from '@streamr/dht'
import fs from 'fs'
import { createNetworkNodeWithSimulator } from '../utils/utils'
import { NetworkNode } from '../../src/NetworkNode'
import { PeerDescriptor } from '../../../dht/src/exports'
import { StreamMessage, toStreamID, MessageID, StreamPartIDUtils, StreamMessageType, toStreamPartID, StreamPartID } from '@streamr/protocol'
import { waitForEvent3 } from '@streamr/utils'
import { streamPartIdToDataKey } from '../../src/logic/StreamEntryPointDiscovery'

const numNodes = 10000

let nodes: NetworkNode[]
let simulator: Simulator
let layer0Ep: PeerDescriptor
const publishIntervals: NodeJS.Timeout[] = []
const streams: Map<StreamPartID, NetworkNode> = new Map()
let currentNode: NetworkNode
let publishInterval: NodeJS.Timeout | undefined
let i = 0

const prepareLayer0 = async () => {
    console.log('Preparing network')
    nodes = []
    simulator = new Simulator(LatencyType.REAL)
    const entryPointId = PeerID.generateRandom()
    const peerDescriptor = {
        kademliaId: entryPointId.value,
        region: getRandomRegion(),
        type: 0,
        nodeName: 'entrypoint'
    }
    layer0Ep = peerDescriptor
    const entryPoint = createNetworkNodeWithSimulator(peerDescriptor, simulator, [peerDescriptor])
    await entryPoint.start()    
    nodes.push(entryPoint)

    console.log('Entrypoint ready')
}

const prepareStream = async (streamId: string) => {
    console.log('Preparing stream ')
    const publisherId = PeerID.generateRandom()
    const peerDescriptor = {
        kademliaId: publisherId.value,
        region: getRandomRegion(),
        type: 0,
        nodeName: streamId
    }
    const streamPartId = toStreamPartID(toStreamID(streamId), 0)
    const streamPublisher = createNetworkNodeWithSimulator(peerDescriptor, simulator, [layer0Ep])
    await streamPublisher.start()
    streamPublisher.subscribe(streamPartId, [])
    nodes.push(streamPublisher)
    streams.set(streamPartId, streamPublisher)
}

const shutdownNetwork = async () => {
    publishIntervals.map((interval) => clearInterval(interval))
    await Promise.all([
        ...nodes.map((node) => node.stop())
    ])
    simulator.stop()
}

const measureJoiningTime = async (count: number) => {
    const nodeId = PeerID.generateRandom()
    const peerDescriptor = {
        kademliaId: nodeId.value,
        type: 0,
        region: getRandomRegion(),
        nodeName: `${count}`
    }
    console.log("starting node with id ", nodeId.toKey())

    // start publishing ons stream
    const stream = Array.from(streams.keys())[Math.floor(Math.random() * streams.size)]
    console.log(stream)
    publishInterval = setInterval(() => {
        i += 1
        const streamMessage = new StreamMessage({
            messageId: new MessageID(
                StreamPartIDUtils.getStreamID(stream),
                0,
                i,
                Math.floor(Math.random() * 20000),
                'peer' as any,
                'msgChainId'
            ),
            prevMsgRef: null,
            content: {
                hello: 'world'
            },
            messageType: StreamMessageType.MESSAGE,
            signature: 'signature',
        })
        streams.get(stream)!.publish(streamMessage, [])
    }, 1000)
    // get random node from network to use as entrypoint
    const randomNode = nodes[Math.floor(Math.random() * nodes.length)]
    const streamSubscriber = createNetworkNodeWithSimulator(peerDescriptor, simulator, [randomNode.stack.getLayer0DhtNode().getPeerDescriptor()])
    currentNode = streamSubscriber
    const start = performance.now()
    await streamSubscriber.start()

    await Promise.all([
        waitForEvent3(streamSubscriber.stack.getStreamrNode() as any, 'newMessage', 60000),
        streamSubscriber.subscribe(stream, [])
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
        const time = await measureJoiningTime(i)
        console.log(`Time to receive first message for ${i + 1} nodes network: ${time}ms`)
        fs.writeSync(logFile, `${i + 1}` + '\t' + `${Math.round(time)}\n`)
    }
    fs.closeSync(logFile)
    await shutdownNetwork()
    Simulator.useFakeTimers(false)
} 

// eslint-disable-next-line promise/catch-or-return
run().then(() => {
    console.log('done')
}).catch((err) => {
    console.error(err)
    const streamParts = currentNode.stack.getStreamrNode()!.getStreamParts()
    const foundData = nodes[0].stack.getLayer0DhtNode().getDataFromDht(streamPartIdToDataKey(streamParts[0]))
    console.log(foundData)
    console.log(currentNode.stack.getLayer0DhtNode().getKBucketPeers().length)
    console.log(currentNode.stack.getLayer0DhtNode().getNumberOfConnections())
    console.log(currentNode.stack.getStreamrNode().getStream(streamParts[0])!.layer1!.getKBucketPeers())
    console.log(currentNode.stack.getStreamrNode().getStream(streamParts[0])!.layer2.getTargetNeighborStringIds())
    console.log(nodes[nodes.length - 1])
    if (publishInterval) {
        clearInterval(publishInterval)
    }
})
