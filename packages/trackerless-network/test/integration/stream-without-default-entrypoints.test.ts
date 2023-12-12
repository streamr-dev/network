import { LatencyType, NodeType, PeerDescriptor, Simulator, SimulatorTransport, getRandomRegion } from '@streamr/dht'
import {
    MessageID,
    MessageRef,
    StreamMessage,
    StreamMessageType,
    StreamPartIDUtils
} from '@streamr/protocol'
import { EthereumAddress, hexToBinary, utf8ToBinary, waitForCondition } from '@streamr/utils'
import { range } from 'lodash'
import { NetworkNode, createNetworkNode } from '../../src/NetworkNode'
import { streamPartIdToDataKey } from '../../src/logic/EntryPointDiscovery'
import { createMockPeerDescriptor } from '../utils/utils'

const STREAM_PART_ID = StreamPartIDUtils.parse('test#0')

describe('stream without default entrypoints', () => {

    let entrypoint: NetworkNode
    let nodes: NetworkNode[]
    let numOfReceivedMessages: number
    const entryPointPeerDescriptor: PeerDescriptor = {
        nodeId: new Uint8Array([1, 2, 3]),
        type: NodeType.NODEJS,
        region: getRandomRegion()
    }

    const streamMessage = new StreamMessage({
        messageId: new MessageID(
            StreamPartIDUtils.getStreamID(STREAM_PART_ID),
            StreamPartIDUtils.getStreamPartition(STREAM_PART_ID),
            666,
            0,
            '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as EthereumAddress,
            'msgChainId'
        ),
        prevMsgRef: new MessageRef(665, 0),
        content: utf8ToBinary(JSON.stringify({
            hello: 'world'
        })),
        messageType: StreamMessageType.MESSAGE,
        signature: hexToBinary('0x1234'),
    })

    beforeEach(async () => {
        const simulator = new Simulator(LatencyType.REAL)
        nodes = []
        numOfReceivedMessages = 0
        const entryPointTransport = new SimulatorTransport(entryPointPeerDescriptor, simulator)
        await entryPointTransport.start()
        entrypoint = createNetworkNode({
            layer0: {
                transport: entryPointTransport,
                stopGivenTransport: true,
                peerDescriptor: entryPointPeerDescriptor,
                entryPoints: [entryPointPeerDescriptor]
            }
        })
        await entrypoint.start()
        await Promise.all(range(20).map(async () => {
            const peerDescriptor = createMockPeerDescriptor()
            const transport = new SimulatorTransport(peerDescriptor, simulator)
            await transport.start()
            const node = createNetworkNode({
                layer0: {
                    peerDescriptor,
                    transport,
                    stopGivenTransport: true,
                    entryPoints: [entryPointPeerDescriptor]
                }
            })
            nodes.push(node)
            await node.start()
        }))
    })

    afterEach(async () => {
        await entrypoint.stop()
        await Promise.all(nodes.map((node) => node.stop()))
    })

    it('can join stream without configured entrypoints one by one', async () => {
        await nodes[0].join(STREAM_PART_ID)
        nodes[0].addMessageListener((_msg) => {
            numOfReceivedMessages += 1
        })
        await Promise.all([
            waitForCondition(() => numOfReceivedMessages === 1, 10000),
            nodes[1].broadcast(streamMessage)
        ])
    })

    it('can join without configured entrypoints simultaneously', async () => {
        nodes[0].addMessageListener((_msg) => {
            numOfReceivedMessages += 1
        })
        await Promise.all([
            waitForCondition(() => numOfReceivedMessages === 1, 15000),
            nodes[0].join(STREAM_PART_ID),
            nodes[1].broadcast(streamMessage),
        ])
    })

    it('multiple nodes can join without configured entrypoints simultaneously', async () => {
        const numOfSubscribers = 8
        await Promise.all(range(numOfSubscribers).map(async (i) => {
            await nodes[i].join(STREAM_PART_ID, { minCount: 4, timeout: 15000 })
            nodes[i].addMessageListener((_msg) => {
                numOfReceivedMessages += 1
            })
        }))
        await Promise.all([
            waitForCondition(() => numOfReceivedMessages === numOfSubscribers, 15000),
            nodes[9].broadcast(streamMessage)
        ])
    }, 45000)

    it('nodes store themselves as entrypoints on streamPart if number of entrypoints is low', async () => {
        for (let i = 0; i < 10; i++) {
            await nodes[i].join(STREAM_PART_ID, { minCount: (i > 0) ? 1 : 0, timeout: 15000 })
        }
        await waitForCondition(async () => {
            const entryPointData = await nodes[15].stack.getLayer0Node().getDataFromDht(streamPartIdToDataKey(STREAM_PART_ID))
            return entryPointData.length >= 7
        }, 15000)
        
    }, 90000)
})
