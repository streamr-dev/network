import { NetworkNode } from '../../src/NetworkNode'
import { range } from 'lodash'
import { NodeType, PeerDescriptor, PeerID, Simulator, SimulatorTransport, LatencyType } from '@streamr/dht'
import {
    MessageID,
    MessageRef,
    StreamMessage,
    StreamMessageType,
    StreamPartIDUtils,
    toStreamID
} from '@streamr/protocol'
import { EthereumAddress, waitForCondition } from '@streamr/utils'
import { streamPartIdToDataKey } from '../../src/logic/StreamEntryPointDiscovery'

describe('stream without default entrypoints', () => {

    let entrypoint: NetworkNode
    let nodes: NetworkNode[]
    let numOfReceivedMessages: number
    const entryPointPeerDescriptor: PeerDescriptor = {
        kademliaId: new Uint8Array([1, 2, 3]),
        nodeName: 'entrypoint',
        type: NodeType.NODEJS
    }

    const STREAM_ID = StreamPartIDUtils.parse('test#0')
    const streamMessage = new StreamMessage({
        messageId: new MessageID(
            toStreamID('test'),
            0,
            666,
            0,
            'peer2' as EthereumAddress,
            'msgChainId'
        ),
        prevMsgRef: new MessageRef(665, 0),
        content: {
            hello: 'world'
        },
        messageType: StreamMessageType.MESSAGE,
        signature: 'signature',
    })

    beforeEach(async () => {
        const simulator = new Simulator(LatencyType.RANDOM)
        nodes = []
        numOfReceivedMessages = 0
        const entryPointTransport = new SimulatorTransport(entryPointPeerDescriptor, simulator)
        entrypoint = new NetworkNode({
            transportLayer: entryPointTransport,
            peerDescriptor: entryPointPeerDescriptor,
            entryPoints: [entryPointPeerDescriptor]
        })
        await entrypoint.start()
        await Promise.all(range(20).map(async (i) => {
            const peerDescriptor: PeerDescriptor = {
                kademliaId: PeerID.fromString(`${i}`).value,
                type: NodeType.NODEJS,
                nodeName: `${i}`
            }
            const transport = new SimulatorTransport(peerDescriptor, simulator)
            const node = new NetworkNode({
                peerDescriptor: peerDescriptor,
                transportLayer: transport,
                entryPoints: [entryPointPeerDescriptor]
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
        await nodes[0].subscribeAndWaitForJoin(STREAM_ID, [])
        nodes[0].addMessageListener((_msg) => {
            numOfReceivedMessages += 1
        })
        await Promise.all([
            waitForCondition(() => numOfReceivedMessages === 1, 10000),
            nodes[1].waitForJoinAndPublish(streamMessage, [], 10000)
        ])
    })

    it('can join without configured entrypoints simultaneously', async () => {
        nodes[0].addMessageListener((_msg) => {
            numOfReceivedMessages += 1
        })
        await Promise.all([
            nodes[0].subscribeAndWaitForJoin(STREAM_ID, []),
            nodes[1].waitForJoinAndPublish(streamMessage, []),
            waitForCondition(() => numOfReceivedMessages === 1, 10000),
        ])
    })

    it('multiple nodes can join without configured entrypoints simultaneously', async () => {
        const numOfSubscribers = 8
        await Promise.all(range(numOfSubscribers).map(async (i) => {
            await nodes[i].subscribeAndWaitForJoin(STREAM_ID, [])
            nodes[i].addMessageListener((_msg) => {
                numOfReceivedMessages += 1
            })
            await waitForCondition(() => nodes[i].stack.getStreamrNode().getStream(STREAM_ID)!.layer2.getTargetNeighborStringIds().length >= 3, 10000)
        }))
        await Promise.all([
            waitForCondition(() => numOfReceivedMessages === numOfSubscribers, 10000),
            nodes[9].waitForJoinAndPublish(streamMessage, [])
        ])
    }, 45000)

    it('nodes store themselves as entrypoints on streamPart if number of entrypoints is low', async () => {
        for (let i = 0; i < 10; i++) {
            await nodes[i].subscribeAndWaitForJoin(STREAM_ID, [])
        }
        const entryPointData = await nodes[15].stack.getLayer0DhtNode().getDataFromDht(streamPartIdToDataKey(STREAM_ID))
        expect(entryPointData.dataEntries!.length).toBeGreaterThanOrEqual(7)
    }, 90000)
})
