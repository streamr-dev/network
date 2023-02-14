import { NetworkNode } from '../../src/NetworkNode'
import { range } from 'lodash'
import { NodeType, PeerDescriptor, PeerID, Simulator, SimulatorTransport } from '@streamr/dht'
import {
    MessageID,
    MessageRef,
    StreamMessage,
    StreamMessageType,
    StreamPartIDUtils,
    toStreamID
} from '@streamr/protocol'
import { EthereumAddress, waitForCondition } from '@streamr/utils'
import { LatencyType } from '@streamr/dht/dist/src/connection/Simulator/Simulator'

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
        await Promise.all(range(50).map(async (i) => {
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

    it.only('can join stream without configured entrypoints one by one', async () => {
        await nodes[0].subscribeAndWaitForJoin(STREAM_ID, [])
        nodes[0].addMessageListener((_msg) => {
            numOfReceivedMessages += 1
        })
        await Promise.all([
            waitForCondition(() => numOfReceivedMessages === 1),
            nodes[1].waitForJoinAndPublish(streamMessage, [])
        ])
    })

    it('can join without configured entrypoints simultaneously', async () => {
        nodes[0].addMessageListener((_msg) => {
            numOfReceivedMessages += 1
        })
        await Promise.all([
            nodes[0].subscribeAndWaitForJoin(STREAM_ID, []),
            waitForCondition(() => numOfReceivedMessages === 1),
            nodes[1].waitForJoinAndPublish(streamMessage, [])
        ])
    })

    it('multiple nodes can join without configured entrypoints simultaneously', async () => {
        const numOfSubscribers = 8
        await Promise.all(range(numOfSubscribers).map(async (i) => {
            await nodes[i].subscribeAndWaitForJoin(STREAM_ID, [])
            nodes[i].addMessageListener((_msg) => {
                numOfReceivedMessages += 1
            })
        }))

        await Promise.all([
            waitForCondition(() => numOfReceivedMessages === numOfSubscribers),
            nodes[20].waitForJoinAndPublish(streamMessage, [])
        ])
    }, 30000)

    // it('stores self as entrypoint on streamPart if number of entrypoints is low', () => {
    //
    // })
})
