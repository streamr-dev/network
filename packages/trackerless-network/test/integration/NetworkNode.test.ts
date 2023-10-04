import { NetworkNode, createNetworkNode } from '../../src/NetworkNode'
import { NodeType, PeerDescriptor, Simulator, SimulatorTransport } from '@streamr/dht'
import {
    MessageID,
    MessageRef,
    StreamMessage,
    StreamMessageType,
    StreamPartIDUtils,
    toStreamID
} from '@streamr/protocol'
import { EthereumAddress, waitForCondition, hexToBinary, utf8ToBinary } from '@streamr/utils'

const STREAM_PART_ID = StreamPartIDUtils.parse('test#0')

describe('NetworkNode', () => {

    let transport1: SimulatorTransport
    let transport2: SimulatorTransport

    let node1: NetworkNode
    let node2: NetworkNode

    const pd1: PeerDescriptor = {
        kademliaId: new Uint8Array([1, 2, 3]),
        type: NodeType.NODEJS
    }

    const pd2: PeerDescriptor = {
        kademliaId: new Uint8Array([1, 1, 1]),
        type: NodeType.NODEJS
    }

    beforeEach(async () => {
        Simulator.useFakeTimers()
        const simulator = new Simulator()
        transport1 = new SimulatorTransport(pd1, simulator)
        transport2 = new SimulatorTransport(pd2, simulator)

        node1 = createNetworkNode({
            layer0: {
                entryPoints: [pd1],
                peerDescriptor: pd1,
                transportLayer: transport1
            }
        })
        node2 = createNetworkNode({
            layer0: {
                entryPoints: [pd1],
                peerDescriptor: pd2,
                transportLayer: transport2
            }
        })

        await node1.start()
        node1.setStreamPartEntryPoints(STREAM_PART_ID, [pd1])
        await node2.start()
        node2.setStreamPartEntryPoints(STREAM_PART_ID, [pd1])
    })

    afterEach(async () => {
        await Promise.all([
            node1.stop(),
            node2.stop()
        ])
        Simulator.useFakeTimers(false)
    })

    it('wait for join + broadcast and subscribe', async () => {
        const streamMessage = new StreamMessage({
            messageId: new MessageID(
                toStreamID('test'),
                0,
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

        let msgCount = 0
        await node1.join(STREAM_PART_ID)
        node1.addMessageListener((msg) => {
            expect(msg.messageId.timestamp).toEqual(666)
            expect(msg.getSequenceNumber()).toEqual(0)
            msgCount += 1
        })
        await node2.broadcast(streamMessage)
        await waitForCondition(() => msgCount === 1)
    })

})
