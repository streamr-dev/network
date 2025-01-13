import { StreamPartIDUtils, until } from '@streamr/utils'
import { NetworkStack } from '../../src/NetworkStack'
import { createMockPeerDescriptor, createStreamMessage } from '../utils/utils'
import { randomUserId } from '@streamr/test-utils'

const STREAM_PART_ID = StreamPartIDUtils.parse('stream#0')

describe('NetworkStack', () => {
    let stack1: NetworkStack
    let stack2: NetworkStack

    const epDescriptor = createMockPeerDescriptor({
        websocket: { host: '127.0.0.1', port: 32222, tls: false }
    })

    beforeEach(async () => {
        stack1 = new NetworkStack({
            layer0: {
                peerDescriptor: epDescriptor,
                entryPoints: [epDescriptor],
                websocketServerEnableTls: false
            }
        })
        stack2 = new NetworkStack({
            layer0: {
                websocketPortRange: { min: 32223, max: 32223 },
                entryPoints: [epDescriptor],
                websocketServerEnableTls: false
            }
        })

        await stack1.start()
        stack1.getContentDeliveryManager().setStreamPartEntryPoints(STREAM_PART_ID, [epDescriptor])
        await stack2.start()
        stack2.getContentDeliveryManager().setStreamPartEntryPoints(STREAM_PART_ID, [epDescriptor])
    })

    afterEach(async () => {
        await Promise.all([stack1.stop(), stack2.stop()])
    })

    it('Can use NetworkNode pub/sub via NetworkStack', async () => {
        let receivedMessages = 0
        stack1.getContentDeliveryManager().joinStreamPart(STREAM_PART_ID)
        stack1.getContentDeliveryManager().on('newMessage', () => {
            receivedMessages += 1
        })
        const msg = createStreamMessage(JSON.stringify({ hello: 'WORLD' }), STREAM_PART_ID, randomUserId())
        stack2.getContentDeliveryManager().broadcast(msg)
        await until(() => receivedMessages === 1)
    })

    it('join and wait for neighbors', async () => {
        await Promise.all([
            stack1.joinStreamPart(STREAM_PART_ID, { minCount: 1, timeout: 5000 }),
            stack2.joinStreamPart(STREAM_PART_ID, { minCount: 1, timeout: 5000 })
        ])
        expect(stack1.getContentDeliveryManager().getNeighbors(STREAM_PART_ID).length).toBe(1)
        expect(stack2.getContentDeliveryManager().getNeighbors(STREAM_PART_ID).length).toBe(1)
    })
})
