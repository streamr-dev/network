import { NetworkNode } from '../../src/logic/NetworkNode'
import { Tracker } from '@streamr/network-tracker'
import {
    MessageID,
    ProxyDirection,
    StreamMessage,
    StreamPartIDUtils,
    toStreamID,
    TrackerRegistryRecord
} from '@streamr/protocol'
import { toEthereumAddress, waitForEvent } from '@streamr/utils'

import { Event as NodeEvent } from '../../src/logic/Node'
import { createTestNetworkNode, startTestTracker } from '../utils'
import { Event as ProxyEvent } from '../../src/logic/proxy/ProxyStreamConnectionClient'

const PUBLISHER_ID = toEthereumAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')

const defaultStreamPartId = StreamPartIDUtils.parse('stream-0#0')

describe('Proxy connection tests', () => {
    let tracker: Tracker
    let contactNode: NetworkNode
    let contactNode2: NetworkNode
    let onewayNode: NetworkNode
    let trackerInfo: TrackerRegistryRecord

    beforeEach(async () => {
        tracker = await startTestTracker({
            port: 30353
        })
        trackerInfo = tracker.getConfigRecord()
        contactNode = createTestNetworkNode({
            id: 'contact-node',
            trackers: [trackerInfo],
            iceServers: [],
            acceptProxyConnections: true,
            webrtcDisallowPrivateAddresses: false
        })
        await contactNode.start()

        contactNode2 = createTestNetworkNode({
            id: 'contact-node-2',
            trackers: [trackerInfo],
            iceServers: [],
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

        onewayNode = createTestNetworkNode({
            id: 'publisher',
            trackers: [trackerInfo],
            iceServers: [],
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
        await onewayNode.addProxyConnectionCandidates(defaultStreamPartId, ['contact-node', 'contact-node-2'], ProxyDirection.PUBLISH, 'publisher')
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getOutboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node', 'contact-node-2'])
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)
    })

    it('subscriber node can form proxy connections', async () => {
        await onewayNode.addProxyConnectionCandidates(defaultStreamPartId, ['contact-node', 'contact-node-2'], ProxyDirection.SUBSCRIBE, 'subscriber')
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getInboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node', 'contact-node-2'])
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)
    })

    it('publisher node can close proxy connections', async () => {
        await onewayNode.addProxyConnectionCandidates(defaultStreamPartId, ['contact-node', 'contact-node-2'], ProxyDirection.PUBLISH, 'publisher')
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getOutboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node', 'contact-node-2'])
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)

        await Promise.all([
            waitForEvent(contactNode, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.removeProxyConnectionCandidates(defaultStreamPartId, ['contact-node']),
        ])

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.hasOutOnlyConnection(defaultStreamPartId, 'contact-node')).toBeFalse()
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.hasOutOnlyConnection(defaultStreamPartId, 'contact-node-2')).toBeTrue()
        await Promise.all([
            waitForEvent(contactNode2, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.removeProxyConnectionCandidates(defaultStreamPartId, ['contact-node-2']),
        ])

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.isSetUp(defaultStreamPartId)).toBeFalse()
        // @ts-expect-error private
        expect(contactNode.streamPartManager.getInboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node-2'])
        // @ts-expect-error private
        expect(contactNode.streamPartManager.hasInOnlyConnection(defaultStreamPartId, 'publisher')).toBeFalse()
    })

    it('subscriber node can close proxy connections', async () => {
        await onewayNode.addProxyConnectionCandidates(defaultStreamPartId, ['contact-node-2'], ProxyDirection.SUBSCRIBE, 'subscriber')
        await onewayNode.addProxyConnectionCandidates(defaultStreamPartId, ['contact-node'], ProxyDirection.SUBSCRIBE, 'subscriber', 2)
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getInboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node', 'contact-node-2'])
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)

        await Promise.all([
            waitForEvent(contactNode, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.removeProxyConnectionCandidates(defaultStreamPartId, ['contact-node']),
        ])

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.hasInOnlyConnection(defaultStreamPartId, 'contact-node')).toBeFalse()
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.hasInOnlyConnection(defaultStreamPartId, 'contact-node-2')).toBeTrue()
        await Promise.all([
            waitForEvent(contactNode2, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.removeProxyConnectionCandidates(defaultStreamPartId, ['contact-node-2']),
        ])

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.isSetUp(defaultStreamPartId)).toBeFalse()
        // @ts-expect-error private
        expect(contactNode.streamPartManager.getOutboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node-2'])
        // @ts-expect-error private
        expect(contactNode.streamPartManager.hasOutOnlyConnection(defaultStreamPartId, 'publisher')).toBeFalse()
    })

    it('closing one-way connections for incorrect direction rejects', async () => {
        await onewayNode.addProxyConnectionCandidates(defaultStreamPartId, ['contact-node'], ProxyDirection.PUBLISH, 'publisher')
        await expect(onewayNode.removeProxyConnectionCandidates(defaultStreamPartId, ['non-contact-node']))
            .rejects
            .toMatch(`proxy candidate`)
    })

    it('publisher cannot connect to non-contact node', async () => {
        const nonContactNode = createTestNetworkNode({
            id: 'non-contact-node',
            trackers: [trackerInfo],
            iceServers: [],
            webrtcDisallowPrivateAddresses: false
        })
        await nonContactNode.start()

        await Promise.all([
            waitForEvent(nonContactNode, NodeEvent.NODE_SUBSCRIBED),
            nonContactNode.subscribe(defaultStreamPartId)
        ])

        await expect(onewayNode.addProxyConnectionCandidates(defaultStreamPartId, ['non-contact-node'], ProxyDirection.PUBLISH, 'publisher'))
            .rejects
            .toMatchObject(
                new Error('Could not open any initial ProxyConnections: ' +
                    new Error(
                        'Joining stream as proxy publish failed on contact-node non-contact-node for stream stream-0#0'
                        + ' reason: Target node non-contact-node rejected proxy publish stream connection stream-0#0'
                    )
                )
            )
        await nonContactNode.stop()
    })

    it('Multiple calls to joinStreamPartAsProxyPublisher do not cancel the first call', async () => {
        await Promise.all([
            // @ts-expect-error private
            waitForEvent(onewayNode.proxyStreamConnectionClient, ProxyEvent.PROXY_CONNECTION_ACCEPTED),
            onewayNode.addProxyConnectionCandidates(defaultStreamPartId, ['contact-node'], ProxyDirection.PUBLISH, 'publisher'),
            onewayNode.addProxyConnectionCandidates(defaultStreamPartId, ['contact-node'], ProxyDirection.PUBLISH, 'publisher'),
            onewayNode.addProxyConnectionCandidates(defaultStreamPartId, ['contact-node'], ProxyDirection.PUBLISH, 'publisher'),
            onewayNode.addProxyConnectionCandidates(defaultStreamPartId, ['contact-node'], ProxyDirection.PUBLISH, 'publisher'),
        ])
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getOutboundNodesForStreamPart(defaultStreamPartId)).toContainValue('contact-node')
    })

    it('Published data is received using proxy publish stream connections', async () => {
        await onewayNode.addProxyConnectionCandidates(defaultStreamPartId, ['contact-node'], ProxyDirection.PUBLISH, 'publisher')
        await Promise.all([
            waitForEvent(contactNode, NodeEvent.MESSAGE_RECEIVED),
            waitForEvent(contactNode2, NodeEvent.MESSAGE_RECEIVED),
            onewayNode.publish(new StreamMessage({
                messageId: new MessageID(toStreamID('stream-0'), 0, 120, 0, PUBLISHER_ID, 'session'),
                content: {
                    hello: 'world'
                },
                signature: 'signature'
            }))
        ])
    })

    it('proxied subscribers receive data', async () => {
        await onewayNode.addProxyConnectionCandidates(defaultStreamPartId, ['contact-node'], ProxyDirection.SUBSCRIBE, 'subscriber')
        await Promise.all([
            waitForEvent(onewayNode, NodeEvent.MESSAGE_RECEIVED),
            contactNode.publish(new StreamMessage({
                messageId: new MessageID(toStreamID('stream-0'), 0, 120, 0, PUBLISHER_ID, 'session'),
                content: {
                    hello: 'world'
                },
                signature: 'signature'
            }))
        ])

    })

    it('proxied subscribers cannot publish data', async () => {
        await onewayNode.addProxyConnectionCandidates(defaultStreamPartId, ['contact-node'], ProxyDirection.SUBSCRIBE, 'subscriber')
        expect(() => onewayNode.publish(new StreamMessage({
            messageId: new MessageID(toStreamID('stream-0'), 0, 120, 0, PUBLISHER_ID, 'session'),
            content: {
                hello: 'world'
            },
            signature: 'signature'
        }))).toThrow('Cannot publish')
    })

    it('Cannot open a proxy publish stream connection to non-existing node (not connected to the streams tracker)', async () => {
        await expect(onewayNode.addProxyConnectionCandidates(defaultStreamPartId, ['non-contact-node'], ProxyDirection.PUBLISH, 'publisher'))
            .rejects
            .toMatchObject(
                new Error('Could not open any initial ProxyConnections: ' +
                    new Error(
                        'Joining stream as proxy publish failed on contact-node non-contact-node for stream stream-0#0'
                        + ' reason: Error: RTC error RTC_UNKNOWN_PEER while attempting to signal with node non-contact-node'
                    )
                )
            )
    })

    it('Cannot open a proxy subscribe stream connection to a node without an existing subscription to the given stream', async () => {
        await expect(onewayNode.addProxyConnectionCandidates(defaultStreamPartId, ['non-contact-node'], ProxyDirection.SUBSCRIBE, 'subscriber'))
            .rejects
            .toMatchObject(
                new Error('Could not open any initial ProxyConnections: ' +
                    new Error(
                        'Joining stream as proxy subscribe failed on contact-node non-contact-node for stream stream-0#0'
                        + ' reason: Error: RTC error RTC_UNKNOWN_PEER while attempting to signal with node non-contact-node'
                    )
                )
            )
    })

    it('if caught, failed publish only connections do not clean out existing connections', async () => {
        await onewayNode.addProxyConnectionCandidates(defaultStreamPartId, ['contact-node'], ProxyDirection.PUBLISH, 'publisher', 3)
        await onewayNode.addProxyConnectionCandidates(defaultStreamPartId, ['contact-node-2'], ProxyDirection.PUBLISH, 'publisher')
        try {
            await onewayNode.addProxyConnectionCandidates(
                StreamPartIDUtils.parse('stream-5#0'),
                ['non-existing-node'],
                ProxyDirection.PUBLISH,
                'publisher'
            )
        } catch (err) {
            // no-op
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
        await onewayNode.addProxyConnectionCandidates(defaultStreamPartId, ['contact-node'], ProxyDirection.PUBLISH, 'publisher')
        await Promise.all([
            waitForEvent(contactNode, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.removeProxyConnectionCandidates(defaultStreamPartId, ['contact-node']),
        ])
        // @ts-expect-error private
        expect(contactNode.streamPartManager.isSetUp(defaultStreamPartId)).toBeTrue()
    })

    it('will not connect above set target limit, one by one', async () => {
        await onewayNode.addProxyConnectionCandidates(defaultStreamPartId, ['contact-node'], ProxyDirection.SUBSCRIBE, 'subscriber')
        await onewayNode.addProxyConnectionCandidates(defaultStreamPartId, ['contact-node-2'], ProxyDirection.SUBSCRIBE, 'subscriber')

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getInboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node'])
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)
    })

    it('will not connect above set target limit, simultaneous', async () => {
        await onewayNode.addProxyConnectionCandidates(
            defaultStreamPartId,
            ['contact-node', 'contact-node-2'],
            ProxyDirection.SUBSCRIBE,
            'subscriber',
            1
        )

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getInboundNodesForStreamPart(defaultStreamPartId)).toBeArrayOfSize(1)
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)
    })

    it('will connect up to a newly set target connection count', async () => {
        await onewayNode.addProxyConnectionCandidates(
            defaultStreamPartId,
            ['contact-node', 'contact-node-2'],
            ProxyDirection.SUBSCRIBE,
            'subscriber',
            1
        )

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getInboundNodesForStreamPart(defaultStreamPartId)).toBeArrayOfSize(1)
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)

        await onewayNode.setNumberOfTargetProxyConnections(defaultStreamPartId, 2)

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getInboundNodesForStreamPart(defaultStreamPartId)).toBeArrayOfSize(2)
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)
    })

    it('will disconnect down to a newly set target connection count', async () => {
        await onewayNode.addProxyConnectionCandidates(
            defaultStreamPartId,
            ['contact-node', 'contact-node-2'],
            ProxyDirection.SUBSCRIBE,
            'subscriber',
            2
        )

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getInboundNodesForStreamPart(defaultStreamPartId)).toBeArrayOfSize(2)
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)

        await onewayNode.setNumberOfTargetProxyConnections(defaultStreamPartId, 1)

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getInboundNodesForStreamPart(defaultStreamPartId)).toBeArrayOfSize(1)
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)
    })

    it('will reconnect after lost connectivity', async () => {
        await onewayNode.addProxyConnectionCandidates(defaultStreamPartId, ['contact-node'], ProxyDirection.PUBLISH, 'publisher')

        await Promise.all([
            waitForEvent(contactNode, NodeEvent.NODE_CONNECTED, 20000),
            // @ts-expect-error private
            contactNode.nodeToNode.disconnectFromNode('publisher', 'testing')
        ])

        await Promise.all([
            waitForEvent(contactNode, NodeEvent.MESSAGE_RECEIVED),
            waitForEvent(contactNode2, NodeEvent.MESSAGE_RECEIVED),
            onewayNode.publish(new StreamMessage({
                messageId: new MessageID(toStreamID('stream-0'), 0, 120, 0, PUBLISHER_ID, 'session'),
                content: {
                    hello: 'world'
                },
                signature: 'signature'
            }))
        ])
    }, 20100)

    it('stop proxy connections on stream', async () => {
        await onewayNode.addProxyConnectionCandidates(
            defaultStreamPartId,
            ['contact-node', 'contact-node-2'],
            ProxyDirection.SUBSCRIBE,
            'subscriber',
            2
        )

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getInboundNodesForStreamPart(defaultStreamPartId)).toBeArrayOfSize(2)
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)

        await onewayNode.removeAllProxyConnectionCandidates(defaultStreamPartId)

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.isSetUp(defaultStreamPartId)).toEqual(false)

    })
})
