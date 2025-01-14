import { LatencyType, PeerDescriptor, Simulator, SimulatorTransport } from '@streamr/dht'
import { randomUserId } from '@streamr/test-utils'
import { StreamPartIDUtils, hexToBinary, toUserIdRaw, utf8ToBinary, until } from '@streamr/utils'
import { range } from 'lodash'
import { NetworkNode, createNetworkNode } from '../../src/NetworkNode'
import { streamPartIdToDataKey } from '../../src/logic/ContentDeliveryManager'
import {
    ContentType,
    EncryptionType,
    SignatureType,
    StreamMessage
} from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import { createMockPeerDescriptor } from '../utils/utils'

const STREAM_PART_ID = StreamPartIDUtils.parse('test#0')

describe('stream without default entrypoints', () => {
    let entrypoint: NetworkNode
    let nodes: NetworkNode[]
    let receivedMessageCount: number
    const entryPointPeerDescriptor: PeerDescriptor = createMockPeerDescriptor()

    const streamMessage: StreamMessage = {
        messageId: {
            streamId: StreamPartIDUtils.getStreamID(STREAM_PART_ID),
            streamPartition: StreamPartIDUtils.getStreamPartition(STREAM_PART_ID),
            timestamp: 666,
            sequenceNumber: 0,
            publisherId: toUserIdRaw(randomUserId()),
            messageChainId: 'msgChainId'
        },
        previousMessageRef: {
            timestamp: 665,
            sequenceNumber: 0
        },
        body: {
            oneofKind: 'contentMessage',
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
        signatureType: SignatureType.SECP256K1,
        signature: hexToBinary('0x1234')
    }

    beforeEach(async () => {
        const simulator = new Simulator(LatencyType.REAL)
        nodes = []
        receivedMessageCount = 0
        const entryPointTransport = new SimulatorTransport(entryPointPeerDescriptor, simulator)
        await entryPointTransport.start()
        entrypoint = createNetworkNode({
            layer0: {
                transport: entryPointTransport,
                connectionsView: entryPointTransport,
                peerDescriptor: entryPointPeerDescriptor,
                entryPoints: [entryPointPeerDescriptor]
            }
        })
        await entrypoint.start()
        await Promise.all(
            range(20).map(async () => {
                const peerDescriptor = createMockPeerDescriptor()
                const transport = new SimulatorTransport(peerDescriptor, simulator)
                await transport.start()
                const node = createNetworkNode({
                    layer0: {
                        peerDescriptor,
                        transport,
                        connectionsView: transport,
                        entryPoints: [entryPointPeerDescriptor]
                    }
                })
                nodes.push(node)
                await node.start()
            })
        )
    })

    afterEach(async () => {
        await entrypoint.stop()
        await Promise.all(nodes.map((node) => node.stop()))
    })

    it('can join stream without configured entrypoints one by one', async () => {
        await nodes[0].join(STREAM_PART_ID)
        nodes[0].addMessageListener((_msg) => {
            receivedMessageCount += 1
        })
        await Promise.all([until(() => receivedMessageCount === 1, 10000), nodes[1].broadcast(streamMessage)])
    })

    it('can join without configured entrypoints simultaneously', async () => {
        nodes[0].addMessageListener((_msg) => {
            receivedMessageCount += 1
        })
        await Promise.all([
            until(() => receivedMessageCount === 1, 15000),
            nodes[0].join(STREAM_PART_ID),
            nodes[1].broadcast(streamMessage)
        ])
    })

    it('multiple nodes can join without configured entrypoints simultaneously', async () => {
        const subscriberCount = 8
        await Promise.all(
            range(subscriberCount).map(async (i) => {
                await nodes[i].join(STREAM_PART_ID, { minCount: 4, timeout: 15000 })
                nodes[i].addMessageListener(() => {
                    receivedMessageCount += 1
                })
            })
        )
        const nonjoinedNode = nodes[subscriberCount]
        await nonjoinedNode.broadcast(streamMessage)
        await until(() => receivedMessageCount === subscriberCount, 15000)
    }, 45000)

    it('nodes store themselves as entrypoints on streamPart if number of entrypoints is low', async () => {
        for (let i = 0; i < 10; i++) {
            await nodes[i].join(STREAM_PART_ID, { minCount: i > 0 ? 1 : 0, timeout: 15000 })
        }
        await until(async () => {
            const entryPointData = await nodes[15].stack
                .getControlLayerNode()
                .fetchDataFromDht(streamPartIdToDataKey(STREAM_PART_ID))
            return entryPointData.length >= 7
        }, 15000)
    }, 90000)
})
