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
    let onewayNode: NetworkNode
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

        onewayNode = createNetworkNode({
            id: 'publisher',
            trackers: [trackerInfo],
            stunUrls: []
        })
        await onewayNode.start()
    })

    afterEach(async () => {
        await tracker.stop()
        await Promise.all([
            onewayNode.stop(),
            contactNode.stop(),
            contactNode2.stop(),
        ])
    })

    it('publisher node can form one-way connections', async () => {
        await onewayNode.joinStreamPartAsPurePublisher(defaultStreamPartId, 'contact-node')
        await onewayNode.joinStreamPartAsPurePublisher(defaultStreamPartId, 'contact-node-2')
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getOutboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node', 'contact-node-2'])
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)
    })

    it('subscriber node can form one-way connections', async () => {
        await onewayNode.joinStreamPartAsPureSubscriber(defaultStreamPartId, 'contact-node')
        await onewayNode.joinStreamPartAsPureSubscriber(defaultStreamPartId, 'contact-node-2')
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getInboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node', 'contact-node-2'])
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)
    })

    it('publisher node can close one way connections', async () => {
        await onewayNode.joinStreamPartAsPurePublisher(defaultStreamPartId, 'contact-node-2')
        await onewayNode.joinStreamPartAsPurePublisher(defaultStreamPartId, 'contact-node')
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getOutboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node', 'contact-node-2'])
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)

        await Promise.all([
            waitForEvent(contactNode, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.leavePurePublishingStreamPart(defaultStreamPartId, 'contact-node'),
        ])
        
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.hasOutOnlyConnection(defaultStreamPartId, 'contact-node')).toBeFalse()
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.hasOutOnlyConnection(defaultStreamPartId, 'contact-node-2')).toBeTrue()
        await Promise.all([
            waitForEvent(contactNode2, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.leavePurePublishingStreamPart(defaultStreamPartId, 'contact-node-2'),
        ])

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.isSetUp(defaultStreamPartId)).toBeFalse()
        // @ts-expect-error private
        expect(contactNode.streamPartManager.getInboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node-2'])
        // @ts-expect-error private
        expect(contactNode.streamPartManager.hasInOnlyConnection(defaultStreamPartId, 'publisher')).toBeFalse()
    })

    it('subscriber node can close one way connections', async () => {
        await onewayNode.joinStreamPartAsPureSubscriber(defaultStreamPartId, 'contact-node-2')
        await onewayNode.joinStreamPartAsPureSubscriber(defaultStreamPartId, 'contact-node')
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getInboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node', 'contact-node-2'])
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)

        await Promise.all([
            waitForEvent(contactNode, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.leavePureSubscribingStreamPart(defaultStreamPartId, 'contact-node'),
        ])

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.hasInOnlyConnection(defaultStreamPartId, 'contact-node')).toBeFalse()
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.hasInOnlyConnection(defaultStreamPartId, 'contact-node-2')).toBeTrue()
        await Promise.all([
            waitForEvent(contactNode2, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.leavePureSubscribingStreamPart(defaultStreamPartId, 'contact-node-2'),
        ])

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.isSetUp(defaultStreamPartId)).toBeFalse()
        // @ts-expect-error private
        expect(contactNode.streamPartManager.getOutboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node-2'])
        // @ts-expect-error private
        expect(contactNode.streamPartManager.hasOutOnlyConnection(defaultStreamPartId, 'publisher')).toBeFalse()
    })

    it('closing one-way connections for incorrect direction rejects', async () => {
        await onewayNode.joinStreamPartAsPureSubscriber(defaultStreamPartId, 'contact-node')
        await expect(onewayNode.leavePurePublishingStreamPart(defaultStreamPartId, 'non-contact-node'))
            .rejects
            .toMatch(`outgoing`)
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

        await expect(onewayNode.joinStreamPartAsPurePublisher(defaultStreamPartId, 'non-contact-node'))
            .rejects
            .toMatch(`failed`)

        await nonContactNode.stop()
    })

    it('Multiple calls to joinStreamPartAsPurePublisher do not cancel the first call', async () => {
        await Promise.all([
            waitForEvent(onewayNode, NodeEvent.PUBLISH_STREAM_ACCEPTED),
            onewayNode.joinStreamPartAsPurePublisher(defaultStreamPartId, 'contact-node'),
            onewayNode.joinStreamPartAsPurePublisher(defaultStreamPartId, 'contact-node'),
            onewayNode.joinStreamPartAsPurePublisher(defaultStreamPartId, 'contact-node'),
            onewayNode.joinStreamPartAsPurePublisher(defaultStreamPartId, 'contact-node'),
        ])
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getOutboundNodesForStreamPart(defaultStreamPartId)).toContainValue('contact-node')
    })
    
    it('Published data is received using publish-only stream connections', async () => {
        await onewayNode.joinStreamPartAsPurePublisher(defaultStreamPartId, 'contact-node')
        await Promise.all([
            waitForEvent(contactNode, NodeEvent.MESSAGE_RECEIVED),
            waitForEvent(contactNode2, NodeEvent.MESSAGE_RECEIVED),
            onewayNode.publish(new StreamMessage({
                messageId: new MessageID(toStreamID('stream-0'), 0, 120, 0, 'publisher', 'session'),
                content: {
                    hello: 'world'
                },
            }))
        ])
    })

    it('one-way subscribers receive data', async () => {
        await onewayNode.joinStreamPartAsPureSubscriber(defaultStreamPartId, 'contact-node')
        await Promise.all([
            waitForEvent(contactNode, NodeEvent.MESSAGE_RECEIVED),
            contactNode.publish(new StreamMessage({
                messageId: new MessageID(toStreamID('stream-0'), 0, 120, 0, 'publisher', 'session'),
                content: {
                    hello: 'world'
                },
            }))
        ])

    })

    it('one-way subscribers cannot publish data', async () => {
        await onewayNode.joinStreamPartAsPureSubscriber(defaultStreamPartId, 'contact-node')
        await expect(Promise.all([
            waitForEvent(contactNode, NodeEvent.MESSAGE_RECEIVED),
            onewayNode.publish(new StreamMessage({
                messageId: new MessageID(toStreamID('stream-0'), 0, 120, 0, 'publisher', 'session'),
                content: {
                    hello: 'world'
                },
            }))
        ])).rejects.toMatchObject(new Error('Promise timed out after 5000 milliseconds'))
    })

    it('Node with existing subscription cannot create a publish only stream connection', async () => {
        await expect(onewayNode.joinStreamPartAsPurePublisher(defaultStreamPartId, 'non-contact-node'))
            .rejects
            .toMatch(`failed`)
    })

    it('Cannot open publish only stream connection to non-existing node (not connected to the streams tracker)', async () => {
        await expect(onewayNode.joinStreamPartAsPurePublisher(defaultStreamPartId, 'non-contact-node'))
            .rejects
            .toMatch(`failed`)
    })

    it('Cannot open publish only stream connection to a node without an existing subscription to the given stream', async () => {
        await expect(onewayNode.joinStreamPartAsPurePublisher(defaultStreamPartId, 'non-contact-node'))
            .rejects
            .toMatch(`failed`)
    })

    it('if caught, failed publish only connections do not clean out existing connections', async () => {
        await onewayNode.joinStreamPartAsPurePublisher(defaultStreamPartId, 'contact-node')
        await onewayNode.joinStreamPartAsPurePublisher(defaultStreamPartId, 'contact-node-2')
        try {
            await onewayNode.joinStreamPartAsPurePublisher(StreamPartIDUtils.parse('stream-5#0'), 'non-existing-node')
        } catch (err) {
        }

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getOutboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node', 'contact-node-2'])
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)
    })

    it('If publish only connection is the only stream connection on contact node it will not unsubscribe', async () => {
        await Promise.all([
            waitForEvent(contactNode, NodeEvent.NODE_UNSUBSCRIBED),
            contactNode2.unsubscribe(defaultStreamPartId)
        ])
        await onewayNode.joinStreamPartAsPurePublisher(defaultStreamPartId, 'contact-node')
        await Promise.all([
            waitForEvent(contactNode, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.leavePurePublishingStreamPart(defaultStreamPartId, 'contact-node'),
        ])
        // @ts-expect-error private
        expect(contactNode.streamPartManager.isSetUp(defaultStreamPartId)).toBeTrue()
    })

    it('will reconnect after lost connectivity', async () => {
        await onewayNode.joinStreamPartAsPurePublisher(defaultStreamPartId, 'contact-node')

        await Promise.all([
            waitForEvent(onewayNode, NodeEvent.NODE_CONNECTED, 20000),
            // @ts-expect-error private
            contactNode.nodeToNode.disconnectFromNode('publisher', 'testing')
        ])

        await Promise.all([
            waitForEvent(contactNode, NodeEvent.MESSAGE_RECEIVED),
            waitForEvent(contactNode2, NodeEvent.MESSAGE_RECEIVED),
            onewayNode.publish(new StreamMessage({
                messageId: new MessageID(toStreamID('stream-0'), 0, 120, 0, 'publisher', 'session'),
                content: {
                    hello: 'world'
                },
            }))
        ])
    }, 20000)
})
