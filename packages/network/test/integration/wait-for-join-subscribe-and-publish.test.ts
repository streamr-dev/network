import { NetworkNode } from '../../src/logic/node/NetworkNode'
import { Tracker } from '../../src/logic/tracker/Tracker'
import { MessageID, StreamMessage, toStreamID, toStreamPartID } from 'streamr-client-protocol'
import { waitForEvent } from 'streamr-test-utils'

import { createNetworkNode, startTracker } from '../../src/composition'
import { Event as NodeEvent } from "../../src/logic/node/Node"

/**
 * This test verifies that on receiving a duplicate message, it is not re-emitted to the node's subscribers.
 */
describe('subscribe and wait for the node to join the stream', () => {
    let tracker: Tracker
    let nodes: NetworkNode[]
    const stream1 = toStreamPartID(toStreamID('stream-1'), 0)
    const stream2 = toStreamPartID(toStreamID('stream-2'), 0)
    const stream3 = toStreamPartID(toStreamID('stream-3'), 0)
    const TIMEOUT = 5000

    beforeAll(async () => {
        tracker = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 30352
            }
        })
        const trackerInfo = tracker.getConfigRecord()

        nodes = [
            createNetworkNode({
                id: 'node-0',
                trackers: [trackerInfo],
                stunUrls: [],
                webrtcDisallowPrivateAddresses: false

            }),
            createNetworkNode({
                id: 'node-1',
                trackers: [trackerInfo],
                stunUrls: [],
                webrtcDisallowPrivateAddresses: false
            }),
            createNetworkNode({
                id: 'node-2',
                trackers: [trackerInfo],
                stunUrls: [],
                webrtcDisallowPrivateAddresses: false
            }),
            createNetworkNode({
                id: 'node-3',
                trackers: [trackerInfo],
                stunUrls: [],
                webrtcDisallowPrivateAddresses: false
            }),
            createNetworkNode({
                id: 'node-4',
                trackers: [trackerInfo],
                stunUrls: [],
                webrtcDisallowPrivateAddresses: false
            })
        ]
        await Promise.all([nodes.map((node) => node.start())])
    }, 5000)

    afterAll(async () => {
        await Promise.allSettled([
            tracker.stop(),
            nodes.map((node) => node.stop())
        ])
    })

    test('subscribing and waiting for joining', async () => {
        const firstNodeNeighbors = await nodes[0].subscribeAndWaitForJoin(stream1, TIMEOUT)
        const firstNodeNeighborsRetry = await nodes[0].subscribeAndWaitForJoin(stream1, TIMEOUT)
        const firstNodeSecondStream = await nodes[0].subscribeAndWaitForJoin(stream2, TIMEOUT)
        expect(firstNodeNeighbors).toEqual(0)
        expect(firstNodeNeighborsRetry).toEqual(0)
        expect(firstNodeSecondStream).toBeGreaterThanOrEqual(0)

        const secondNodeNeighbors = await nodes[1].subscribeAndWaitForJoin(stream1, TIMEOUT)
        const thirdNodeNeighbors = await nodes[2].subscribeAndWaitForJoin(stream1, TIMEOUT)
        const fourthNodeNeighbors = await nodes[3].subscribeAndWaitForJoin(stream1, TIMEOUT)
        const fifthNodeNeighbors = await nodes[4].subscribeAndWaitForJoin(stream1, TIMEOUT)
        expect(secondNodeNeighbors).toEqual(1)
        expect(thirdNodeNeighbors).toEqual(2)
        expect(fourthNodeNeighbors).toEqual(3)
        expect(fifthNodeNeighbors).toEqual(4)

        await Promise.all([
            waitForEvent(nodes[0], NodeEvent.NODE_UNSUBSCRIBED),
            nodes[1].unsubscribe(stream1)
        ])

        const resubscribeNeighbors = await nodes[1].subscribeAndWaitForJoin(stream1, TIMEOUT)
        expect(resubscribeNeighbors).toEqual(4)
    })

    test('wait for join and publish', async () => {
        const msg = new StreamMessage({
            messageId: new MessageID(toStreamID('stream-2'), 0, 0, 0, 'publisherId', 'msgChainId'),
            prevMsgRef: null,
            content: {
                foo: 'bar'
            }
        })
        const firstNeighbors = await nodes[0].subscribeAndWaitForJoin(stream2, TIMEOUT)
        const result = await Promise.all([
            waitForEvent(nodes[0], NodeEvent.MESSAGE_RECEIVED),
            nodes[1].waitForJoinAndPublish(msg, TIMEOUT)
        ])
        expect(firstNeighbors).toBeGreaterThanOrEqual(0)
        expect(result[1]).toEqual(1)
    })

    test('Simultaneous joins return valid neighbor counts (depends on tracker debouncing)', async () => {
        const ret = await Promise.all([
            nodes[0].subscribeAndWaitForJoin(stream3, TIMEOUT),
            nodes[1].subscribeAndWaitForJoin(stream3, TIMEOUT),
            nodes[2].subscribeAndWaitForJoin(stream3, TIMEOUT),
            nodes[3].subscribeAndWaitForJoin(stream3, TIMEOUT),
            nodes[4].subscribeAndWaitForJoin(stream3, TIMEOUT)
        ])
        ret.map((numOfNeighbors) => {
            expect(numOfNeighbors).toEqual(4)
        })
    })
})
