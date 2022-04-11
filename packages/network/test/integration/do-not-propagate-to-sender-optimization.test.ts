import { NetworkNode } from '../../src/logic/NetworkNode'
import { Tracker, startTracker } from '@streamr/network-tracker'
import { MessageLayer, StreamPartIDUtils, toStreamID } from 'streamr-client-protocol'
import { waitForCondition } from 'streamr-test-utils'

import { createNetworkNode, NodeEvent } from '../../src/composition'

const { StreamMessage, MessageID, MessageRef } = MessageLayer

/**
 * This test verifies that on receiving a message, the receiver will not propagate the message to the sender as they
 * obviously already know about the message.
 */
describe('optimization: do not propagate to sender', () => {
    let tracker: Tracker
    let n1: NetworkNode
    let n2: NetworkNode
    let n3: NetworkNode

    beforeAll(async () => {
        tracker = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 30410
            }
        })
        const trackerInfo = tracker.getConfigRecord()
        n1 = createNetworkNode({
            id: 'node-1',
            trackers: [trackerInfo],
            webrtcDisallowPrivateAddresses: false
        })
        n2 = createNetworkNode({
            id: 'node-2',
            trackers: [trackerInfo],
            webrtcDisallowPrivateAddresses: false
        })
        n3 = createNetworkNode({
            id: 'node-3',
            trackers: [trackerInfo],
            webrtcDisallowPrivateAddresses: false
        })

        await n1.start()
        await n2.start()
        await n3.start()

        // Become subscribers (one-by-one, for well connected graph)
        const streamPartId = StreamPartIDUtils.parse('stream-id#0')
        n1.subscribe(streamPartId)
        n2.subscribe(streamPartId)
        n3.subscribe(streamPartId)

        // Wait for fully-connected network
        await waitForCondition(() => {
            return n1.getNeighbors().length === 2
                && n2.getNeighbors().length === 2
                && n3.getNeighbors().length === 2
        })
    })

    afterAll(async () => {
        await Promise.allSettled([
            tracker.stop(),
            n1.stop(),
            n2.stop(),
            n3.stop()
        ])
    })

    // In a fully-connected network the number of duplicates should be (n-1)(n-2) instead of (n-1)^2 when not
    // propagating received messages back to their source
    test('total duplicates == 2 in a fully-connected network of 3 nodes', async () => {
        const onDuplicateMessage = jest.fn()
        const nodes = [n1, n2, n3]
        nodes.forEach((n) => {
            n.on(NodeEvent.DUPLICATE_MESSAGE_RECEIVED, onDuplicateMessage)
        })

        n1.publish(new StreamMessage({
            messageId: new MessageID(toStreamID('stream-id'), 0, 100, 0, 'publisher', 'session'),
            prevMsgRef: new MessageRef(99, 0),
            content: {
                hello: 'world'
            },
        }))

        await waitForCondition(() => onDuplicateMessage.mock.calls.length > 0)

        // TODO is it possible that waitForCondition() polls a state where 
        // onDuplicateMessage.mock.calls.length === 1? (DUPLICATE_MESSAGE_RECEIVED events are 
        // are usually emitten within few milliseconds)
        expect(onDuplicateMessage.mock.calls.length).toEqual(2)
    })
})
