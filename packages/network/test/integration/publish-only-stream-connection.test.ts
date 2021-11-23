import { NetworkNode } from '../../src/logic/node/NetworkNode'
import { Tracker } from '../../src/logic/tracker/Tracker'
import { MessageLayer, SPID } from 'streamr-client-protocol'
import { waitForEvent } from 'streamr-test-utils'

import { createNetworkNode, startTracker } from '../../src/composition'
import { Event as NodeEvent } from "../../src/logic/node/Node"

const { StreamMessage, MessageID } = MessageLayer

/**
 * This test verifies that on receiving a duplicate message, it is not re-emitted to the node's subscribers.
 */
describe('Publish only connection tests', () => {
    let tracker: Tracker
    let contactNode: NetworkNode
    let contactNode2: NetworkNode
    let nonContactNode: NetworkNode
    let publisherNode: NetworkNode
    const streamSPID = new SPID('stream-0', 0)

    beforeEach(async () => {
        tracker = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 30353
            },
            id: 'tracker'
        })
        const trackerInfo = {id: 'tracker', ws: tracker.getUrl(), http: tracker.getUrl()}
        contactNode = createNetworkNode({
            id: 'contact-node',
            trackers: [trackerInfo],
            stunUrls: [],
            acceptOneWayConnections: true
        })
        await contactNode.start()

        contactNode2 = createNetworkNode({
            id: 'contact-node-2',
            trackers: [trackerInfo],
            stunUrls: [],
            acceptOneWayConnections: true
        })
        await contactNode2.start()

        nonContactNode = createNetworkNode({
            id: 'non-contact-node',
            trackers: [trackerInfo],
            stunUrls: []
        })
        await nonContactNode.start()

        await Promise.all([
            contactNode.subscribe('stream-0', 0),
            contactNode2.subscribe('stream-0', 0),
            nonContactNode.subscribe('stream-0', 0),
            waitForEvent(contactNode, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(contactNode2, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(nonContactNode, NodeEvent.NODE_SUBSCRIBED)
        ])

        publisherNode = createNetworkNode({
            id: 'publisher',
            trackers: [trackerInfo],
            stunUrls: []
        })
        await publisherNode.start()
    })

    afterEach(async () => {
        await tracker.stop()
        await contactNode.stop()
        await contactNode2.stop()
        await nonContactNode.stop()
        await publisherNode.stop()
    })

    it('publisher node can form one-way connections', async () => {
        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_ACCEPTED),
            publisherNode.joinStreamAsPurePublisher('stream-0', 0, 'contact-node'),
        ])
        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_ACCEPTED),
            publisherNode.joinStreamAsPurePublisher('stream-0', 0, 'contact-node-2'),
        ])
        // @ts-expect-error private
        expect(publisherNode.streams.getOutboundNodesForStream(streamSPID)).toContainValues(['contact-node', 'contact-node-2'])
        // @ts-expect-error private
        expect(publisherNode.streams.getNeighborsForStream(streamSPID)).toBeArrayOfSize(0)
    })

    it('publisher node can close one way connections', async () => {
        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_ACCEPTED),
            publisherNode.joinStreamAsPurePublisher('stream-0', 0, 'contact-node-2'),
        ])
        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_ACCEPTED),
            publisherNode.joinStreamAsPurePublisher('stream-0', 0, 'contact-node'),
        ])
        // @ts-expect-error private
        expect(publisherNode.streams.getOutboundNodesForStream(streamSPID)).toContainValues(['contact-node', 'contact-node-2'])
        // @ts-expect-error private
        expect(publisherNode.streams.getNeighborsForStream(streamSPID)).toBeArrayOfSize(0)

        await Promise.all([
            waitForEvent(contactNode, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            publisherNode.leavePurePublishingStream('stream-0', 0, 'contact-node'),
        ])
        // @ts-expect-error private
        expect(publisherNode.streams.hasOutOnlyConnection(streamSPID, 'contact-node')).toBeFalse()
        // @ts-expect-error private
        expect(publisherNode.streams.hasOutOnlyConnection(streamSPID, 'contact-node-2')).toBeTrue()
        await Promise.all([
            waitForEvent(contactNode2, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            publisherNode.leavePurePublishingStream('stream-0', 0, 'contact-node-2'),
        ])
        // @ts-expect-error private
        expect(publisherNode.streams.isSetUp(streamSPID)).toBeFalse()
        // @ts-expect-error private
        expect(contactNode.streams.getInboundNodesForStream(streamSPID)).toContainValues(['contact-node-2', 'non-contact-node'])
        // @ts-expect-error private
        expect(contactNode.streams.hasInOnlyConnection(streamSPID, 'publisher')).toBeFalse()
    })

    it('publisher cannot connect to non-contact node', async () => {
        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_REJECTED),
            publisherNode.joinStreamAsPurePublisher('stream-0', 0, 'non-contact-node')
        ])
        // @ts-expect-error private
        expect(publisherNode.streams.isSetUp(streamSPID)).toBeFalse()
    })

    it('Published data is received using one-way stream connections', async () => {
        await Promise.all([
            publisherNode.joinStreamAsPurePublisher('stream-0', 0, 'contact-node'),
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_ACCEPTED)
        ])
        await Promise.all([
            waitForEvent(contactNode, NodeEvent.MESSAGE_RECEIVED),
            waitForEvent(contactNode2, NodeEvent.MESSAGE_RECEIVED),
            publisherNode.publish(new StreamMessage({
                messageId: new MessageID('stream-0', 0, 120, 0, 'publisher', 'session'),
                content: {
                    hello: 'world'
                },
            }))
        ])
    })

    it('Node with existing subscription cannot create a publish only stream connection', async () => {
        await Promise.all([
            waitForEvent(contactNode, NodeEvent.PUBLISH_STREAM_REJECTED),
            contactNode.joinStreamAsPurePublisher('stream-0', 0, 'contact-node-2'),
        ])
        // @ts-expect-error private
        expect(contactNode.streams.isSetUp(streamSPID)).toBeTrue()
    })

    it('Cannot open publish only stream connection to non-existing node (not connected to the streams tracker)', async () => {
        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_REJECTED),
            publisherNode.joinStreamAsPurePublisher('stream-0', 0, 'non-existing-node'),
        ])
        // @ts-expect-error private
        expect(publisherNode.streams.isSetUp(streamSPID)).toBeFalse()
    })

    it('Cannot open publish only stream connection to a node without an existing subscription to the given stream', async () => {
        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_REJECTED),
            publisherNode.joinStreamAsPurePublisher('non-existing-stream', 0, 'contact-node'),
        ])
        // @ts-expect-error private
        expect(publisherNode.streams.isSetUp(streamSPID)).toBeFalse()
    })

    it('Multiple calls to joinStreamAsPurePublisher do not cancel the first call', async () => {
        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_ACCEPTED),
            publisherNode.joinStreamAsPurePublisher('stream-0', 0, 'contact-node'),
            publisherNode.joinStreamAsPurePublisher('stream-0', 0, 'contact-node'),
            publisherNode.joinStreamAsPurePublisher('stream-0', 0, 'contact-node'),
            publisherNode.joinStreamAsPurePublisher('stream-0', 0, 'contact-node'),
        ])
        // @ts-expect-error private
        expect(publisherNode.streams.getOutboundNodesForStream(streamSPID)).toContainValue('contact-node')
    })

    it('failed publish only connections do not clean out existing connections', async () => {
        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_ACCEPTED),
            publisherNode.joinStreamAsPurePublisher('stream-0', 0, 'contact-node'),
        ])
        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_ACCEPTED),
            publisherNode.joinStreamAsPurePublisher('stream-0', 0, 'contact-node-2'),
        ])
        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_REJECTED),
            publisherNode.joinStreamAsPurePublisher('stream-5', 0, 'non-existing-node'),
        ])

        // @ts-expect-error private
        expect(publisherNode.streams.getOutboundNodesForStream(streamSPID)).toContainValues(['contact-node', 'contact-node-2'])
        // @ts-expect-error private
        expect(publisherNode.streams.getNeighborsForStream(streamSPID)).toBeArrayOfSize(0)
    })
})