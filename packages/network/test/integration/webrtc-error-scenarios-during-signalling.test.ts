import { waitForEvent } from 'streamr-test-utils'

import { Tracker } from '../../src/logic/Tracker'
import { NetworkNode } from '../../src/NetworkNode'
import { startNetworkNode, startTracker } from '../../src/composition'
import { Event as NodeEvent } from '../../src/logic/Node'
import { Event as TrackerNodeEvent } from '../../src/protocol/TrackerNode'

/**
 * Tests for error scenarios during signalling
 */
describe('Signalling error scenarios', () => {
    let tracker: Tracker
    let nodeOne: NetworkNode
    let nodeTwo: NetworkNode
    const streamId = 'stream-1'

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 35115,
            id: 'tracker'
        })

        nodeOne = await startNetworkNode({
            host: '127.0.0.1',
            port: 35116,
            id: 'node-1',
            trackers: [tracker.getAddress()],
            disconnectionWaitTime: 2000,
            newWebrtcConnectionTimeout: 4000
        })
        nodeTwo = await startNetworkNode({
            host: '127.0.0.1',
            port: 35117,
            id: 'node-2',
            trackers: [tracker.getAddress()],
            disconnectionWaitTime: 2000,
            newWebrtcConnectionTimeout: 4000
        })

        nodeOne.start()
        nodeTwo.start()
    })

    afterEach(async () => {
        await Promise.all([
            tracker.stop(),
            nodeOne.stop(),
            nodeTwo.stop()
        ])
    })

    it('connection recovers after timeout if one endpoint closes during signalling', async () => {
        nodeOne.subscribe(streamId, 0)
        nodeTwo.subscribe(streamId, 0)

        // @ts-expect-error private field
        await waitForEvent(nodeTwo.trackerNode, TrackerNodeEvent.RELAY_MESSAGE_RECEIVED)

        // @ts-expect-error private field
        nodeTwo.nodeToNode.endpoint.connections['node-1'].logger.debug('closing via test...')
        // @ts-expect-error private field
        nodeTwo.nodeToNode.endpoint.connections['node-1'].close()
        await waitForEvent(nodeTwo, NodeEvent.NODE_CONNECTED, 30000)
        // @ts-expect-error private field
        expect(Object.keys(nodeTwo.nodeToNode.endpoint.connections)).toEqual(['node-1'])
    }, 60000)

    it('connection recovers after timeout if both endpoint close during signalling', async () => {
        nodeOne.subscribe(streamId, 0)
        nodeTwo.subscribe(streamId, 0)

        await Promise.all([
            // @ts-expect-error private field
            waitForEvent(nodeTwo.trackerNode, TrackerNodeEvent.RELAY_MESSAGE_RECEIVED),
            // @ts-expect-error private field
            waitForEvent(nodeOne.trackerNode, TrackerNodeEvent.RELAY_MESSAGE_RECEIVED)
        ])

        // @ts-expect-error private field
        nodeTwo.nodeToNode.endpoint.connections['node-1'].close()
        // @ts-expect-error private field
        nodeOne.nodeToNode.endpoint.connections['node-2'].close()

        await Promise.allSettled([
            waitForEvent(nodeOne, NodeEvent.NODE_DISCONNECTED),
            waitForEvent(nodeTwo, NodeEvent.NODE_DISCONNECTED)
        ])

        await Promise.allSettled([
            waitForEvent(nodeOne, NodeEvent.NODE_CONNECTED),
            waitForEvent(nodeTwo, NodeEvent.NODE_CONNECTED)
        ])

        // @ts-expect-error private field
        expect(Object.keys(nodeOne.nodeToNode.endpoint.connections)).toEqual(['node-2'])
        // @ts-expect-error private field
        expect(Object.keys(nodeTwo.nodeToNode.endpoint.connections)).toEqual(['node-1'])
    }, 20000)

    it('nodes recover if both signaller connections fail during signalling', async () => {
        nodeOne.subscribe('stream-id', 0)
        nodeTwo.subscribe('stream-id', 0)

        await Promise.all([
            // @ts-expect-error private field
            waitForEvent(nodeOne.trackerNode, TrackerNodeEvent.RELAY_MESSAGE_RECEIVED),
            // @ts-expect-error private field
            waitForEvent(nodeTwo.trackerNode, TrackerNodeEvent.RELAY_MESSAGE_RECEIVED)
        ])

        await Promise.all([
            // @ts-expect-error private field
            nodeOne.trackerNode.endpoint.close('tracker'),
            // @ts-expect-error private field
            nodeTwo.trackerNode.endpoint.close('tracker'),
            // @ts-expect-error private field
            waitForEvent(nodeOne.trackerNode, TrackerNodeEvent.TRACKER_DISCONNECTED),
            // @ts-expect-error private field
            waitForEvent(nodeTwo.trackerNode, TrackerNodeEvent.TRACKER_DISCONNECTED),
        ])

        await Promise.all([
            // @ts-expect-error private field
            waitForEvent(nodeOne.trackerNode, TrackerNodeEvent.CONNECTED_TO_TRACKER),
            // @ts-expect-error private field
            waitForEvent(nodeTwo.trackerNode, TrackerNodeEvent.CONNECTED_TO_TRACKER),
        ])

        await Promise.all([
            waitForEvent(nodeOne, NodeEvent.NODE_CONNECTED),
            waitForEvent(nodeTwo, NodeEvent.NODE_CONNECTED)
        ])
        // @ts-expect-error private field
        expect(Object.keys(nodeOne.nodeToNode.endpoint.connections)).toEqual(['node-2'])
        // @ts-expect-error private field
        expect(Object.keys(nodeTwo.nodeToNode.endpoint.connections)).toEqual(['node-1'])
    })

    it('nodes recover if one signaller connection fails during signalling', async () => {
        nodeOne.subscribe('stream-id', 0)
        nodeTwo.subscribe('stream-id', 0)

        await Promise.race([
            // @ts-expect-error private field
            waitForEvent(nodeOne.trackerNode, TrackerNodeEvent.RELAY_MESSAGE_RECEIVED),
            // @ts-expect-error private field
            waitForEvent(nodeTwo.trackerNode, TrackerNodeEvent.RELAY_MESSAGE_RECEIVED)
        ])

        await Promise.all([
            // @ts-expect-error private field
            nodeOne.trackerNode.endpoint.close('tracker'),
            // @ts-expect-error private field
            waitForEvent(nodeOne.trackerNode, TrackerNodeEvent.TRACKER_DISCONNECTED),
        ])

        // @ts-expect-error private field
        await waitForEvent(nodeOne.trackerNode, TrackerNodeEvent.CONNECTED_TO_TRACKER)

        await Promise.all([
            waitForEvent(nodeOne, NodeEvent.NODE_CONNECTED),
            waitForEvent(nodeTwo, NodeEvent.NODE_CONNECTED)
        ])
        // @ts-expect-error private field
        expect(Object.keys(nodeOne.nodeToNode.endpoint.connections)).toEqual(['node-2'])
        // @ts-expect-error private field
        expect(Object.keys(nodeTwo.nodeToNode.endpoint.connections)).toEqual(['node-1'])
    })
})
