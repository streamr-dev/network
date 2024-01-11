/* eslint-disable no-console */

import {
    DhtNode,
    getNodeIdFromPeerDescriptor,
    getRandomRegion,
    LatencyType,
    PeerDescriptor,
    Simulator
} from '@streamr/dht'
import {
    ContentType,
    EncryptionType,
    MessageID,
    SignatureType,
    StreamMessage,
    StreamMessageType,
    StreamPartID,
    StreamPartIDUtils,
    toStreamID,
    toStreamPartID
} from '@streamr/protocol'
import { hexToBinary, utf8ToBinary, waitForEvent3 } from '@streamr/utils'
import fs from 'fs'
import { NetworkNode } from '../../src/NetworkNode'
import { streamPartIdToDataKey } from '../../src/logic/EntryPointDiscovery'
import { createMockPeerDescriptor, createNetworkNodeWithSimulator } from '../utils/utils'
import { Layer1Node } from '../../src/logic/Layer1Node'
import { RandomGraphNode } from '../../src/logic/RandomGraphNode'

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
    const entryPoint = await createNetworkNodeWithSimulator(peerDescriptor, simulator, [peerDescriptor])
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
    const streamPublisher = await createNetworkNodeWithSimulator(peerDescriptor, simulator, [layer0Ep])
    await streamPublisher.start()
    streamPublisher.join(streamPartId)
    nodes.push(streamPublisher)
    streamParts.set(streamPartId, streamPublisher)
}

const shutdownNetwork = async () => {
    publishIntervals.forEach((interval) => clearInterval(interval))
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
                '2222' as any,
                'msgChainId'
            ),
            prevMsgRef: null,
            content: utf8ToBinary(JSON.stringify({
                hello: 'world'
            })),
            messageType: StreamMessageType.MESSAGE,
            contentType: ContentType.JSON,
            encryptionType: EncryptionType.NONE,
            signature: hexToBinary('0x1234'),
            signatureType: SignatureType.SECP256K1,

        })
        streamParts.get(stream)!.broadcast(streamMessage)
    }, 1000)
    // get random node from network to use as entrypoint
    const randomNode = nodes[Math.floor(Math.random() * nodes.length)]
    const streamSubscriber = await createNetworkNodeWithSimulator(
        peerDescriptor,
        simulator,
        [randomNode.stack.getLayer0Node().getLocalPeerDescriptor()]
    )
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
} 

// eslint-disable-next-line promise/catch-or-return, promise/always-return
run().then(() => {
    console.log('done')
}).catch((err) => {
    console.error(err)
    const streamrNode = currentNode.stack.getStreamrNode()
    const streamParts = streamrNode.getStreamParts()
    const foundData = nodes[0].stack.getLayer0Node().getDataFromDht(streamPartIdToDataKey(streamParts[0]))
    console.log(foundData)
    const layer0Node = currentNode.stack.getLayer0Node() as DhtNode
    console.log(layer0Node.getAllNeighborPeerDescriptors().length)
    console.log(layer0Node.getNumberOfConnections())
    const streamPartDelivery = streamrNode.getStreamPartDelivery(streamParts[0])! as { layer1Node: Layer1Node, node: RandomGraphNode }
    console.log(streamPartDelivery.layer1Node.getAllNeighborPeerDescriptors())
    console.log(streamPartDelivery.node.getNeighborIds())
    console.log(nodes[nodes.length - 1])
    if (publishInterval) {
        clearInterval(publishInterval)
    }
})
