import LeakDetector from 'jest-leak-detector'
import { PeerDescriptor } from '@streamr/dht'
import { MessageID, StreamMessage, StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { hexToBinary, utf8ToBinary, waitForCondition } from '@streamr/utils'
import { NetworkNode, createNetworkNode } from '../../src/NetworkNode'
import { NetworkStack } from '../../src/NetworkStack'
import { createMockPeerDescriptor } from '../utils/utils'

const STREAM_PART_ID = StreamPartIDUtils.parse('stream#0')
const CONTENT = { foo: 'bar' }

const startNode = async (epPeerDescriptor: PeerDescriptor, port: number) => {
    const node = createNetworkNode({
        layer0: {
            entryPoints: [epPeerDescriptor],
            websocketPortRange: { min: port, max: port },
            numberOfNodesPerKBucket: 4
        }
    })
    await node.start()
    node.setStreamPartEntryPoints(STREAM_PART_ID, [epPeerDescriptor])
    return node
}

const createMessage = (): StreamMessage => {
    return new StreamMessage({ 
        messageId: new MessageID(
            StreamPartIDUtils.getStreamID(STREAM_PART_ID),
            StreamPartIDUtils.getStreamPartition(STREAM_PART_ID),
            0,
            0,
            randomEthereumAddress(),
            ''
        ),
        content: utf8ToBinary(JSON.stringify(CONTENT)),
        signature: hexToBinary('0x1234')
    })
}

describe('memory leak', () => {

    it('broadcast', async () => {
        const epPeerDescriptor = createMockPeerDescriptor({
            websocket: { host: '127.0.0.1', port: 14445, tls: false }
        })
        // TODO could be just DhtNode?
        let entryPoint: NetworkStack | undefined = new NetworkStack({
            layer0: {
                entryPoints: [epPeerDescriptor],
                peerDescriptor: epPeerDescriptor,
            }
        })
        await entryPoint.start()
        entryPoint.getStreamrNode()!.setStreamPartEntryPoints(STREAM_PART_ID, [epPeerDescriptor])
        entryPoint.getStreamrNode()!.joinStreamPart(STREAM_PART_ID)
        let publisher: NetworkNode | undefined = await startNode(epPeerDescriptor, 14446)
        let subscriber: NetworkNode | undefined = await startNode(epPeerDescriptor, 14447)

        await Promise.all([
            publisher.join(STREAM_PART_ID, { minCount: 1, timeout: 5000 }),
            subscriber.join(STREAM_PART_ID, { minCount: 1, timeout: 5000 })
        ])
        let receivedMessage: StreamMessage | undefined
        subscriber.addMessageListener((message) => {
            receivedMessage = message
        })
        await publisher.broadcast(createMessage())
        await waitForCondition(() => receivedMessage !== undefined)

        expect(receivedMessage!.getParsedContent()).toEqual(CONTENT)

        await Promise.all([
            entryPoint.stop(),
            publisher.stop(),
            subscriber.stop()
        ])

        const detector1 = new LeakDetector(entryPoint)
        entryPoint = undefined
        expect(await detector1.isLeaking()).toBe(false)

        const detector2 = new LeakDetector(publisher)
        publisher = undefined
        expect(await detector2.isLeaking()).toBe(false)

        const detector3 = new LeakDetector(subscriber)
        subscriber = undefined
        expect(await detector3.isLeaking()).toBe(false)
    })
})
