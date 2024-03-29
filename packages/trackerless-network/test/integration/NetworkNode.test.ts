import { PeerDescriptor, Simulator, SimulatorTransport } from '@streamr/dht'
import {
    ContentType,
    EncryptionType,
    MessageID,
    MessageRef, SignatureType,
    StreamMessage,
    StreamMessageType,
    StreamPartIDUtils
} from '@streamr/protocol'
import { EthereumAddress, hexToBinary, utf8ToBinary, waitForCondition } from '@streamr/utils'
import { NetworkNode, createNetworkNode } from '../../src/NetworkNode'
import { createMockPeerDescriptor } from '../utils/utils'

const STREAM_PART_ID = StreamPartIDUtils.parse('test#0')

describe('NetworkNode', () => {

    let transport1: SimulatorTransport
    let transport2: SimulatorTransport

    let node1: NetworkNode
    let node2: NetworkNode

    const pd1: PeerDescriptor = createMockPeerDescriptor()

    const pd2: PeerDescriptor = createMockPeerDescriptor()

    beforeEach(async () => {
        const simulator = new Simulator()
        transport1 = new SimulatorTransport(pd1, simulator)
        await transport1.start()
        transport2 = new SimulatorTransport(pd2, simulator)
        await transport2.start()

        node1 = createNetworkNode({
            layer0: {
                entryPoints: [pd1],
                peerDescriptor: pd1,
                transport: transport1
            }
        })
        node2 = createNetworkNode({
            layer0: {
                entryPoints: [pd1],
                peerDescriptor: pd2,
                transport: transport2
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
    })

    it('wait for join + broadcast and subscribe', async () => {
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
            contentType: ContentType.JSON,
            messageType: StreamMessageType.MESSAGE,
            encryptionType: EncryptionType.NONE,
            signatureType: SignatureType.SECP256K1,
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

    it('fetchNodeInfo', async () => {
        await node1.join(STREAM_PART_ID)
        await node2.join(STREAM_PART_ID)
        const result1 = await node1.fetchNodeInfo(pd2)
        const result2 = await node2.fetchNodeInfo(pd1)
        const result3 = await node1.fetchNodeInfo(node1.getPeerDescriptor())
        expect(result1.streamPartitions.length).toEqual(1)
        expect(result2.streamPartitions.length).toEqual(1)
        expect(result3.streamPartitions.length).toEqual(1)
        expect(result1.controlLayer.connections.length).toEqual(1)
        expect(result2.controlLayer.connections.length).toEqual(1)
        expect(result3.controlLayer.connections.length).toEqual(1)
        expect(result1.controlLayer.neighbors.length).toEqual(1)
        expect(result2.controlLayer.neighbors.length).toEqual(1)
        expect(result3.controlLayer.neighbors.length).toEqual(1)
    })

})
