import {
    StreamPartIDUtils
} from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { waitForCondition } from '@streamr/utils'
import { NetworkStack } from '../../src/NetworkStack'
import { createMockPeerDescriptor, createStreamMessage } from '../utils/utils'

describe('NetworkStack', () => {

    let stack1: NetworkStack
    let stack2: NetworkStack
    const streamPartId = StreamPartIDUtils.parse('stream1#0')

    const epDescriptor = createMockPeerDescriptor({
        websocket: { host: '127.0.0.1', port: 32222, tls: false },
        nodeName: 'entrypoint'
    })

    beforeEach(async () => {
        stack1 = new NetworkStack({
            layer0: {
                peerDescriptor: epDescriptor,
                entryPoints: [epDescriptor],
                nodeName: 'entrypoint'
            }
        })
        stack2 = new NetworkStack({
            layer0: {
                websocketPortRange: { min: 32223, max: 32223 },
                entryPoints: [epDescriptor],
                nodeName: 'node2'
            }
        })

        await stack1.start()
        stack1.getStreamrNode()!.setStreamPartEntryPoints(streamPartId, [epDescriptor])
        await stack2.start()
        stack2.getStreamrNode()!.setStreamPartEntryPoints(streamPartId, [epDescriptor])
    })

    afterEach(async () => {
        await Promise.all([
            stack1.stop(),
            stack2.stop()
        ])
    })

    it('Can use NetworkNode pub/sub via NetworkStack', async () => {
        let receivedMessages = 0
        stack1.getStreamrNode().joinStream(streamPartId)
        stack1.getStreamrNode().on('newMessage', () => {
            receivedMessages += 1
        })
        const msg = createStreamMessage(
            JSON.stringify({ hello: 'WORLD' }),
            streamPartId,
            randomEthereumAddress()
        )
        stack2.getStreamrNode().broadcast(msg)
        await waitForCondition(() => receivedMessages === 1)
    })

    it('join and wait for neighbors', async () => {
        await Promise.all([
            stack1.joinStreamPart(streamPartId, { minCount: 1, timeout: 5000 }),
            stack2.joinStreamPart(streamPartId, { minCount: 1, timeout: 5000 }),
        ])
        expect(stack1.getStreamrNode().getNeighbors(streamPartId).length).toBe(1)
        expect(stack2.getStreamrNode().getNeighbors(streamPartId).length).toBe(1)
    })
})
