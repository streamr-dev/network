/* eslint-disable no-console */

import { DhtNode, createRandomDhtAddress } from '@streamr/dht'
import { NetworkNode, createNetworkNode } from '../../src/NetworkNode'
import { ContentType, EncryptionType, MessageID, SignatureType, StreamMessage, StreamMessageType, StreamPartIDUtils } from '@streamr/protocol'
import { hexToBinary, utf8ToBinary, wait } from '@streamr/utils'
import { sample } from 'lodash'

let messageCounter = 0
let inspectionCounter = 0
let failedInspections = 0

const run = async () => {
    const nodes: NetworkNode[] = []
    const numNodes = 40
    const STREAM_PART_ID = StreamPartIDUtils.parse('test#0')
    const entryPoint = new DhtNode({
        nodeId: createRandomDhtAddress(),
        entryPoints: [],
        websocketHost: '127.0.0.1',
        websocketPortRange: { min: 10000, max: 10000 },
        websocketServerEnableTls: false,
    })
    await entryPoint.start()
    const entryPointPeerDescriptor = entryPoint.getLocalPeerDescriptor()
    for (let i = 0; i < numNodes; i++) {
        const node = createNetworkNode({
            layer0: {
                nodeId: createRandomDhtAddress(),
                entryPoints: [entryPointPeerDescriptor],
                websocketHost: '127.0.0.1',
                websocketPortRange: { min: 10001, max: 10200 },
                websocketServerEnableTls: false,
                maxConnections: 20
            }
        })
        await node.start()
        nodes.push(node)
    }
    await Promise.all(nodes.map((node) => node.join(STREAM_PART_ID)))
    setInterval(async () => {
        messageCounter += 1
        const streamMessage = new StreamMessage({
            messageId: new MessageID(
                StreamPartIDUtils.getStreamID(STREAM_PART_ID),
                0,
                messageCounter,
                Math.floor(Math.random() * 20000),
                '2222' as any,
                'msgChainId'
            ),
            content: utf8ToBinary(JSON.stringify({
                hello: 'world'
            })),
            messageType: StreamMessageType.MESSAGE,
            contentType: ContentType.JSON,
            encryptionType: EncryptionType.NONE,
            signature: hexToBinary('0x1234'),
            signatureType: SignatureType.SECP256K1,

        })
        console.log('Broadcasting...')
        await nodes[0].broadcast(streamMessage)
    }, 5000)

    setInterval(async () => {
        inspectionCounter += 1
        const inspector = sample(nodes)!
        const inspected = sample(nodes.filter((node) => node.getNodeId() !== inspector.getNodeId()))!
        console.log(inspector.getNodeId(), 'inspecting', inspected.getNodeId())
        try {
            const started = Date.now()
            const result = await inspector.inspect(inspected.getPeerDescriptor(), STREAM_PART_ID)
            console.log(inspector.getNodeId(), 'inspected', inspected.getNodeId(), result, 'in', Date.now() - started, 'ms')
        } catch (err) {
            console.error(inspector.getNodeId(), 'failed to inspect', inspected.getNodeId())
            failedInspections += 1
        }
    }, 5000)

    await wait(60 * 60 * 1000)
    console.log('messageCounter', messageCounter)
    console.log('inspectionCounter', inspectionCounter)
    console.log('failedInspections', failedInspections)
    process.exit(0)
}

run()
