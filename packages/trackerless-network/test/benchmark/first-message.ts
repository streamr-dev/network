/* eslint-disable no-console */

import { DhtNode, toNodeId, getRandomRegion, LatencyType, PeerDescriptor, Simulator } from '@streamr/dht'
import {
    hexToBinary,
    StreamPartID,
    StreamPartIDUtils,
    toStreamID,
    toStreamPartID,
    toUserId,
    toUserIdRaw,
    utf8ToBinary,
    waitForEvent3
} from '@streamr/utils'
import fs from 'fs'
import { ContentDeliveryLayerNode } from '../../src/logic/ContentDeliveryLayerNode'
import { streamPartIdToDataKey } from '../../src/logic/ContentDeliveryManager'
import { DiscoveryLayerNode } from '../../src/logic/DiscoveryLayerNode'
import { NetworkNode } from '../../src/NetworkNode'
import {
    ContentType,
    EncryptionType,
    SignatureType
} from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import { createMockPeerDescriptor, createNetworkNodeWithSimulator } from '../utils/utils'

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
    await Promise.all([...nodes.map((node) => node.stop())])
    simulator.stop()
}

const measureJoiningTime = async () => {
    const peerDescriptor = createMockPeerDescriptor({
        region: getRandomRegion()
    })
    console.log('starting node with id ', toNodeId(peerDescriptor))

    // start publishing ons stream
    const stream = Array.from(streamParts.keys())[Math.floor(Math.random() * streamParts.size)]
    console.log(stream)
    publishInterval = setInterval(() => {
        i += 1
        const streamMessage = {
            messageId: {
                streamId: StreamPartIDUtils.getStreamID(stream),
                streamPartition: 0,
                timestamp: i,
                sequenceNumber: Math.floor(Math.random() * 20000),
                publisherId: toUserIdRaw(toUserId('0x2222')),
                messageChainId: 'msgChainId'
            },
            body: {
                oneofKind: 'contentMessage' as const,
                contentMessage: {
                    content: utf8ToBinary(
                        JSON.stringify({
                            hello: 'world'
                        })
                    ),
                    contentType: ContentType.JSON,
                    encryptionType: EncryptionType.NONE
                }
            },
            signature: hexToBinary('0x1234'),
            signatureType: SignatureType.SECP256K1
        }
        streamParts.get(stream)!.broadcast(streamMessage)
    }, 1000)
    // get random node from network to use as entrypoint
    const randomNode = nodes[Math.floor(Math.random() * nodes.length)]
    const streamSubscriber = await createNetworkNodeWithSimulator(peerDescriptor, simulator, [
        randomNode.stack.getControlLayerNode().getLocalPeerDescriptor()
    ])
    currentNode = streamSubscriber
    const start = performance.now()
    await streamSubscriber.start()

    await Promise.all([
        waitForEvent3(streamSubscriber.stack.getContentDeliveryManager() as any, 'newMessage', 60000),
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

run()
    .then(() => {
        console.log('done')
    })
    .catch((err) => {
        console.error(err)
        const contentDeliveryManager = currentNode.stack.getContentDeliveryManager()
        const streamParts = contentDeliveryManager.getStreamParts()
        const foundData = nodes[0].stack.getControlLayerNode().fetchDataFromDht(streamPartIdToDataKey(streamParts[0]))
        console.log(foundData)
        const controlLayerNode = currentNode.stack.getControlLayerNode() as DhtNode
        console.log(controlLayerNode.getNeighbors().length)
        console.log(controlLayerNode.getConnectionsView().getConnectionCount())
        const streamPartDelivery = contentDeliveryManager.getStreamPartDelivery(streamParts[0])! as {
            discoveryLayerNode: DiscoveryLayerNode
            node: ContentDeliveryLayerNode
        }
        console.log(streamPartDelivery.discoveryLayerNode.getNeighbors())
        console.log(streamPartDelivery.node.getNeighbors())
        console.log(nodes[nodes.length - 1])
        if (publishInterval) {
            clearInterval(publishInterval)
        }
    })
