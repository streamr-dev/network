import { NetworkNode } from '../../src/logic/node/NetworkNode'
import { Tracker } from '../../src/logic/tracker/Tracker'
import { MessageLayer, StreamPartIDUtils, toStreamID } from 'streamr-client-protocol'
import { waitForEvent } from 'streamr-test-utils'

import { createNetworkNode, startTracker } from '../../src/composition'
import { Event as NodeEvent } from '../../src/logic/node/Node'
import { TrackerInfo } from '../../src/identifiers'

const { StreamMessage, MessageID } = MessageLayer

const defaultStreamPartId = StreamPartIDUtils.parse('stream-0#0')

/**
 * This test verifies that on receiving a duplicate message, it is not re-emitted to the node's subscribers.
 */
describe('Publish only connection tests', () => {
    let tracker: Tracker
    let contactNode: NetworkNode
    let contactNode2: NetworkNode
    let publisherNode: NetworkNode
    let trackerInfo: TrackerInfo

    beforeEach(async () => {
        tracker = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 30353
            }
        })
        trackerInfo = tracker.getConfigRecord()
        contactNode = createNetworkNode({
            id: 'contact-node',
            trackers: [trackerInfo],
            stunUrls: [],
            acceptProxyConnections: true
        })
        await contactNode.start()

        contactNode2 = createNetworkNode({
            id: 'contact-node-2',
            trackers: [trackerInfo],
            stunUrls: [],
            acceptProxyConnections: true
        })
        await contactNode2.start()

        await Promise.all([
            contactNode.subscribe(defaultStreamPartId),
            contactNode2.subscribe(defaultStreamPartId),
            waitForEvent(contactNode, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(contactNode2, NodeEvent.NODE_SUBSCRIBED),
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
        await Promise.all([
            publisherNode.stop(),
            contactNode.stop(),
            contactNode2.stop(),
        ])
    })

    it('publisher node can form one-way connections', async () => {
        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_ACCEPTED),
            publisherNode.joinStreamAsPurePublisher(defaultStreamPartId, 'contact-node'),
        ])
        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_ACCEPTED),
            publisherNode.joinStreamAsPurePublisher(defaultStreamPartId, 'contact-node-2'),
        ])
        // @ts-expect-error private
        expect(publisherNode.streams.getOutboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node', 'contact-node-2'])
        // @ts-expect-error private
        expect(publisherNode.streams.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)
    })

    it('publisher node can close one way connections', async () => {
        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_ACCEPTED),
            publisherNode.joinStreamAsPurePublisher(defaultStreamPartId, 'contact-node-2'),
        ])
        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_ACCEPTED),
            publisherNode.joinStreamAsPurePublisher(defaultStreamPartId, 'contact-node'),
        ])
        // @ts-expect-error private
        expect(publisherNode.streams.getOutboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node', 'contact-node-2'])
        // @ts-expect-error private
        expect(publisherNode.streams.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)

        await Promise.all([
            waitForEvent(contactNode, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            publisherNode.leavePurePublishingStream(defaultStreamPartId, 'contact-node'),
        ])
        
        // @ts-expect-error private
        expect(publisherNode.streams.hasOutOnlyConnection(defaultStreamPartId, 'contact-node')).toBeFalse()
        // @ts-expect-error private
        expect(publisherNode.streams.hasOutOnlyConnection(defaultStreamPartId, 'contact-node-2')).toBeTrue()
        await Promise.all([
            waitForEvent(contactNode2, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            publisherNode.leavePurePublishingStream(defaultStreamPartId, 'contact-node-2'),
        ])

        // @ts-expect-error private
        expect(publisherNode.streams.isSetUp(defaultStreamPartId)).toBeFalse()
        // @ts-expect-error private
        expect(contactNode.streams.getInboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node-2'])
        // @ts-expect-error private
        expect(contactNode.streams.hasInOnlyConnection(defaultStreamPartId, 'publisher')).toBeFalse()
    })

    it('publisher cannot connect to non-contact node', async () => {
        const nonContactNode = createNetworkNode({
            id: 'non-contact-node',
            trackers: [trackerInfo],
            stunUrls: []
        })
        await nonContactNode.start()

        await Promise.all([
            waitForEvent(nonContactNode, NodeEvent.NODE_SUBSCRIBED),
            nonContactNode.subscribe(defaultStreamPartId)
        ])

        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_REJECTED),
            publisherNode.joinStreamAsPurePublisher(defaultStreamPartId, 'non-contact-node')
        ])
        // @ts-expect-error private
        expect(publisherNode.streams.isSetUp(defaultStreamPartId)).toBeFalse()

        await nonContactNode.stop()

    })

    it('Published data is received using one-way stream connections', async () => {
        await Promise.all([
            publisherNode.joinStreamAsPurePublisher(defaultStreamPartId, 'contact-node'),
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_ACCEPTED)
        ])
        await Promise.all([
            waitForEvent(contactNode, NodeEvent.MESSAGE_RECEIVED),
            waitForEvent(contactNode2, NodeEvent.MESSAGE_RECEIVED),
            publisherNode.publish(new StreamMessage({
                messageId: new MessageID(toStreamID('stream-0'), 0, 120, 0, 'publisher', 'session'),
                content: {
                    hello: 'world'
                },
            }))
        ])
    })

    it('Node with existing subscription cannot create a publish only stream connection', async () => {
        await Promise.all([
            waitForEvent(contactNode, NodeEvent.PUBLISH_STREAM_REJECTED),
            contactNode.joinStreamAsPurePublisher(defaultStreamPartId, 'contact-node-2'),
        ])
        // @ts-expect-error private
        expect(contactNode.streams.isSetUp(defaultStreamPartId)).toBeTrue()
    })

    it('Cannot open publish only stream connection to non-existing node (not connected to the streams tracker)', async () => {
        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_REJECTED),
            publisherNode.joinStreamAsPurePublisher(defaultStreamPartId, 'non-existing-node'),
        ])
        // @ts-expect-error private
        expect(publisherNode.streams.isSetUp(defaultStreamPartId)).toBeFalse()
    })

    it('Cannot open publish only stream connection to a node without an existing subscription to the given stream', async () => {
        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_REJECTED),
            publisherNode.joinStreamAsPurePublisher(StreamPartIDUtils.parse('non-existing-stream#0'), 'contact-node'),
        ])
        // @ts-expect-error private
        expect(publisherNode.streams.isSetUp(defaultStreamPartId)).toBeFalse()
    })

    it('Multiple calls to joinStreamAsPurePublisher do not cancel the first call', async () => {
        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_ACCEPTED),
            publisherNode.joinStreamAsPurePublisher(defaultStreamPartId, 'contact-node'),
            publisherNode.joinStreamAsPurePublisher(defaultStreamPartId, 'contact-node'),
            publisherNode.joinStreamAsPurePublisher(defaultStreamPartId, 'contact-node'),
            publisherNode.joinStreamAsPurePublisher(defaultStreamPartId, 'contact-node'),
        ])
        // @ts-expect-error private
        expect(publisherNode.streams.getOutboundNodesForStreamPart(defaultStreamPartId)).toContainValue('contact-node')
    })

    it('failed publish only connections do not clean out existing connections', async () => {
        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_ACCEPTED),
            publisherNode.joinStreamAsPurePublisher(defaultStreamPartId, 'contact-node'),
        ])
        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_ACCEPTED),
            publisherNode.joinStreamAsPurePublisher(defaultStreamPartId, 'contact-node-2'),
        ])
        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_REJECTED),
            publisherNode.joinStreamAsPurePublisher(StreamPartIDUtils.parse('stream-5#0'), 'non-existing-node'),
        ])

        // @ts-expect-error private
        expect(publisherNode.streams.getOutboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node', 'contact-node-2'])
        // @ts-expect-error private
        expect(publisherNode.streams.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)
    })

    it('If publish only connection is the only stream connection on contact node it will not unsubscribe', async () => {
        await Promise.all([
            waitForEvent(contactNode, NodeEvent.NODE_UNSUBSCRIBED),
            contactNode2.unsubscribe(defaultStreamPartId)
        ])
        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_ACCEPTED),
            publisherNode.joinStreamAsPurePublisher(defaultStreamPartId, 'contact-node'),
        ])
        await Promise.all([
            waitForEvent(contactNode, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            publisherNode.leavePurePublishingStream(defaultStreamPartId, 'contact-node'),
        ])
        // @ts-expect-error private
        expect(contactNode.streams.isSetUp(defaultStreamPartId)).toBeTrue()
    })

    it('will reconnect after lost connectivity', async () => {
        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.PUBLISH_STREAM_ACCEPTED),
            publisherNode.joinStreamAsPurePublisher(defaultStreamPartId, 'contact-node'),
        ])

        await Promise.all([
            waitForEvent(publisherNode, NodeEvent.NODE_CONNECTED, 20000),
            // @ts-expect-error private
            contactNode.nodeToNode.disconnectFromNode('publisher', 'testing')
        ])

        await Promise.all([
            waitForEvent(contactNode, NodeEvent.MESSAGE_RECEIVED),
            waitForEvent(contactNode2, NodeEvent.MESSAGE_RECEIVED),
            publisherNode.publish(new StreamMessage({
                messageId: new MessageID(toStreamID('stream-0'), 0, 120, 0, 'publisher', 'session'),
                content: {
                    hello: 'world'
                },
            }))
        ])

    }, 20000)
})
