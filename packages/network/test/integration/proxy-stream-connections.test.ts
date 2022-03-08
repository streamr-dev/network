import { NetworkNode } from '../../src/logic/node/NetworkNode'
import { Tracker } from '../../src/logic/tracker/Tracker'
import { MessageLayer, ProxyDirection, StreamPartIDUtils, toStreamID } from 'streamr-client-protocol'
import { waitForEvent } from 'streamr-test-utils'

import { createNetworkNode, startTracker } from '../../src/composition'
import { Event as NodeEvent } from '../../src/logic/node/Node'
import { TrackerInfo } from '../../src/identifiers'

const { StreamMessage, MessageID } = MessageLayer

const defaultStreamPartId = StreamPartIDUtils.parse('stream-0#0')

describe('Proxy connection tests', () => {
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
            acceptProxyConnections: true,
            webrtcDisallowPrivateAddresses: false
        })
        await contactNode.start()

        contactNode2 = createNetworkNode({
            id: 'contact-node-2',
            trackers: [trackerInfo],
            stunUrls: [],
            acceptProxyConnections: true,
            webrtcDisallowPrivateAddresses: false
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
            stunUrls: [],
            webrtcDisallowPrivateAddresses: false
        })
        await onewayNode.start()
    })

    afterEach(async () => {
        await Promise.allSettled([
            tracker?.stop(),
            onewayNode?.stop(),
            contactNode?.stop(),
            contactNode2?.stop(),
        ])
    })

    it('publisher node can form proxy connections', async () => {
        await onewayNode.createProxyConnection(defaultStreamPartId, 'contact-node', ProxyDirection.PUBLISH)
        await onewayNode.createProxyConnection(defaultStreamPartId, 'contact-node-2', ProxyDirection.PUBLISH)
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getOutboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node', 'contact-node-2'])
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)
    })

    it('subscriber node can form proxy connections', async () => {
        await onewayNode.createProxyConnection(defaultStreamPartId, 'contact-node', ProxyDirection.SUBSCRIBE)
        await onewayNode.createProxyConnection(defaultStreamPartId, 'contact-node-2', ProxyDirection.SUBSCRIBE)
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getInboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node', 'contact-node-2'])
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)
    })

    it('publisher node can close proxy connections', async () => {
        await onewayNode.createProxyConnection(defaultStreamPartId, 'contact-node-2', ProxyDirection.PUBLISH)
        await onewayNode.createProxyConnection(defaultStreamPartId, 'contact-node', ProxyDirection.PUBLISH)
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getOutboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node', 'contact-node-2'])
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)

        await Promise.all([
            waitForEvent(contactNode, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.removeProxyConnection(defaultStreamPartId, 'contact-node', ProxyDirection.PUBLISH),
        ])
        
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.hasOutOnlyConnection(defaultStreamPartId, 'contact-node')).toBeFalse()
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.hasOutOnlyConnection(defaultStreamPartId, 'contact-node-2')).toBeTrue()
        await Promise.all([
            waitForEvent(contactNode2, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.removeProxyConnection(defaultStreamPartId, 'contact-node-2', ProxyDirection.PUBLISH),
        ])

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.isSetUp(defaultStreamPartId)).toBeFalse()
        // @ts-expect-error private
        expect(contactNode.streamPartManager.getInboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node-2'])
        // @ts-expect-error private
        expect(contactNode.streamPartManager.hasInOnlyConnection(defaultStreamPartId, 'publisher')).toBeFalse()
    })

    it('subscriber node can close proxy connections', async () => {
        await onewayNode.createProxyConnection(defaultStreamPartId, 'contact-node-2', ProxyDirection.SUBSCRIBE)
        await onewayNode.createProxyConnection(defaultStreamPartId, 'contact-node', ProxyDirection.SUBSCRIBE)
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getInboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node', 'contact-node-2'])
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)

        await Promise.all([
            waitForEvent(contactNode, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.removeProxyConnection(defaultStreamPartId, 'contact-node', ProxyDirection.SUBSCRIBE),
        ])

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.hasInOnlyConnection(defaultStreamPartId, 'contact-node')).toBeFalse()
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.hasInOnlyConnection(defaultStreamPartId, 'contact-node-2')).toBeTrue()
        await Promise.all([
            waitForEvent(contactNode2, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.removeProxyConnection(defaultStreamPartId, 'contact-node-2', ProxyDirection.SUBSCRIBE),
        ])

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.isSetUp(defaultStreamPartId)).toBeFalse()
        // @ts-expect-error private
        expect(contactNode.streamPartManager.getOutboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node-2'])
        // @ts-expect-error private
        expect(contactNode.streamPartManager.hasOutOnlyConnection(defaultStreamPartId, 'publisher')).toBeFalse()
    })

    it('closing one-way connections for incorrect direction rejects', async () => {
        await onewayNode.createProxyConnection(defaultStreamPartId, 'contact-node', ProxyDirection.PUBLISH)
        await expect(onewayNode.removeProxyConnection(defaultStreamPartId, 'non-contact-node', ProxyDirection.PUBLISH))
            .rejects
            .toMatch(`proxy publish`)
    })

    it('publisher cannot connect to non-contact node', async () => {
        const nonContactNode = createNetworkNode({
            id: 'non-contact-node',
            trackers: [trackerInfo],
            stunUrls: [],
            webrtcDisallowPrivateAddresses: false
        })
        await nonContactNode.start()

        await Promise.all([
            waitForEvent(nonContactNode, NodeEvent.NODE_SUBSCRIBED),
            nonContactNode.subscribe(defaultStreamPartId)
        ])

        await expect(onewayNode.createProxyConnection(defaultStreamPartId, 'non-contact-node', ProxyDirection.PUBLISH))
            .rejects
            .toMatchObject(
                new Error(
                    'Joining stream as proxy publish failed on contact-node non-contact-node for stream stream-0#0'
                    + ' reason: Target node non-contact-node rejected proxy publish stream connection stream-0#0'
                )
            )

        await nonContactNode.stop()
    })

    it('Multiple calls to joinStreamPartAsProxyPublisher do not cancel the first call', async () => {
        await Promise.all([
            waitForEvent(onewayNode, NodeEvent.PROXY_CONNECTION_ACCEPTED),
            onewayNode.createProxyConnection(defaultStreamPartId, 'contact-node', ProxyDirection.PUBLISH),
            onewayNode.createProxyConnection(defaultStreamPartId, 'contact-node', ProxyDirection.PUBLISH),
            onewayNode.createProxyConnection(defaultStreamPartId, 'contact-node', ProxyDirection.PUBLISH),
            onewayNode.createProxyConnection(defaultStreamPartId, 'contact-node', ProxyDirection.PUBLISH),
        ])
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getOutboundNodesForStreamPart(defaultStreamPartId)).toContainValue('contact-node')
    })
    
    it('Published data is received using proxy publish stream connections', async () => {
        await onewayNode.createProxyConnection(defaultStreamPartId, 'contact-node', ProxyDirection.PUBLISH)
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

    it('proxied subscribers receive data', async () => {
        await onewayNode.createProxyConnection(defaultStreamPartId, 'contact-node', ProxyDirection.SUBSCRIBE)
        await Promise.all([
            waitForEvent(onewayNode, NodeEvent.MESSAGE_RECEIVED),
            contactNode.publish(new StreamMessage({
                messageId: new MessageID(toStreamID('stream-0'), 0, 120, 0, 'publisher', 'session'),
                content: {
                    hello: 'world'
                },
            }))
        ])

    })

    it('proxied subscribers cannot publish data', async () => {
        await onewayNode.createProxyConnection(defaultStreamPartId, 'contact-node', ProxyDirection.SUBSCRIBE)
        expect(() => onewayNode.publish(new StreamMessage({
            messageId: new MessageID(toStreamID('stream-0'), 0, 120, 0, 'publisher', 'session'),
            content: {
                hello: 'world'
            },
        }))).toThrow('Cannot publish')
    })

    it('Cannot open a proxy publish stream connection to non-existing node (not connected to the streams tracker)', async () => {
        await expect(onewayNode.createProxyConnection(defaultStreamPartId, 'non-contact-node', ProxyDirection.PUBLISH))
            .rejects
            .toMatchObject(
                new Error(
                    'Joining stream as proxy publish failed on contact-node non-contact-node for stream stream-0#0'
                    + ' reason: Error: RTC error RTC_UNKNOWN_PEER while attempting to signal with node non-contact-node'
                )
            )
    })

    it('Cannot open a proxy subscribe stream connection to a node without an existing subscription to the given stream', async () => {
        await expect(onewayNode.createProxyConnection(defaultStreamPartId, 'non-contact-node', ProxyDirection.SUBSCRIBE))
            .rejects
            .toMatchObject(
                new Error(
                    'Joining stream as proxy subscribe failed on contact-node non-contact-node for stream stream-0#0'
                    + ' reason: Error: RTC error RTC_UNKNOWN_PEER while attempting to signal with node non-contact-node'
                )
            )
    })

    it('if caught, failed publish only connections do not clean out existing connections', async () => {
        await onewayNode.createProxyConnection(defaultStreamPartId, 'contact-node', ProxyDirection.PUBLISH)
        await onewayNode.createProxyConnection(defaultStreamPartId, 'contact-node-2', ProxyDirection.PUBLISH)
        try {
            await onewayNode.createProxyConnection(StreamPartIDUtils.parse('stream-5#0'), 'non-existing-node', ProxyDirection.PUBLISH)
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
        await onewayNode.createProxyConnection(defaultStreamPartId, 'contact-node', ProxyDirection.PUBLISH)
        await Promise.all([
            waitForEvent(contactNode, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.removeProxyConnection(defaultStreamPartId, 'contact-node', ProxyDirection.PUBLISH),
        ])
        // @ts-expect-error private
        expect(contactNode.streamPartManager.isSetUp(defaultStreamPartId)).toBeTrue()
    })

    it('will reconnect after lost connectivity', async () => {
        await onewayNode.createProxyConnection(defaultStreamPartId, 'contact-node', ProxyDirection.PUBLISH)

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
    }, 20100)
})
