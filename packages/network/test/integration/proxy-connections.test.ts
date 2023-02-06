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
import { toEthereumAddress, wait, waitForEvent } from '@streamr/utils'

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

    const createContactNode = () => {
        return createTestNetworkNode({
            id: 'contact-node',
            trackers: [trackerInfo],
            iceServers: [],
            acceptProxyConnections: true,
            webrtcDisallowPrivateAddresses: false
        })
    }

    beforeEach(async () => {
        tracker = await startTestTracker({
            port: 30353
        })
        trackerInfo = tracker.getConfigRecord()
        contactNode = createContactNode()
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
            contactNode2?.stop()
        ])
    })

    it('publisher node can form proxy connections', async () => {
        await onewayNode.setProxies(defaultStreamPartId, ['contact-node', 'contact-node-2'], ProxyDirection.PUBLISH, async () => 'publisher')
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getOutboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node', 'contact-node-2'])
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)
    })
    
    it('subscriber node can form proxy connections', async () => {
        await onewayNode.setProxies(defaultStreamPartId, ['contact-node', 'contact-node-2'], ProxyDirection.SUBSCRIBE, async () => 'subscriber')
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getInboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node', 'contact-node-2'])
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)
    })

    it('publisher node can close proxy connections', async () => {
        await onewayNode.setProxies(defaultStreamPartId, ['contact-node', 'contact-node-2'], ProxyDirection.PUBLISH, async () => 'publisher')
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getOutboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node', 'contact-node-2'])
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)

        await Promise.all([
            waitForEvent(contactNode, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.setProxies(defaultStreamPartId, ['contact-node-2'], ProxyDirection.PUBLISH, async () => 'publisher'),
        ])

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.hasOutOnlyConnection(defaultStreamPartId, 'contact-node')).toBeFalse()
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.hasOutOnlyConnection(defaultStreamPartId, 'contact-node-2')).toBeTrue()
        await Promise.all([
            waitForEvent(contactNode2, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.setProxies(defaultStreamPartId, [], ProxyDirection.PUBLISH, async () => 'publisher'),
        ])

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.isSetUp(defaultStreamPartId)).toBeFalse()
        // @ts-expect-error private
        expect(contactNode.streamPartManager.getInboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node-2'])
        // @ts-expect-error private
        expect(contactNode.streamPartManager.hasInOnlyConnection(defaultStreamPartId, 'publisher')).toBeFalse()
    })

    it('subscriber node can close proxy connections', async () => {
        await onewayNode.setProxies(defaultStreamPartId, ['contact-node', 'contact-node-2'], ProxyDirection.SUBSCRIBE, async () => 'subscriber', 2)
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getInboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node', 'contact-node-2'])
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)

        await Promise.all([
            waitForEvent(contactNode, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.setProxies(defaultStreamPartId, ['contact-node-2'], ProxyDirection.SUBSCRIBE, async () => 'subscriber'),
        ])

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.hasInOnlyConnection(defaultStreamPartId, 'contact-node')).toBeFalse()
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.hasInOnlyConnection(defaultStreamPartId, 'contact-node-2')).toBeTrue()
        await Promise.all([
            waitForEvent(contactNode2, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.setProxies(defaultStreamPartId, [], ProxyDirection.SUBSCRIBE, async () => 'subscriber'),
        ])

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.isSetUp(defaultStreamPartId)).toBeFalse()
        // @ts-expect-error private
        expect(contactNode.streamPartManager.getOutboundNodesForStreamPart(defaultStreamPartId)).toContainValues(['contact-node-2'])
        // @ts-expect-error private
        expect(contactNode.streamPartManager.hasOutOnlyConnection(defaultStreamPartId, 'publisher')).toBeFalse()
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

        await expect(onewayNode.setProxies(defaultStreamPartId, ['non-contact-node'], ProxyDirection.PUBLISH, async () => 'publisher'))
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
            // @ts-expect-error private
            waitForEvent(onewayNode.proxyStreamConnectionClient, ProxyEvent.PROXY_CONNECTION_ACCEPTED),
            onewayNode.setProxies(defaultStreamPartId, ['contact-node'], ProxyDirection.PUBLISH, async () => 'publisher'),
            onewayNode.setProxies(defaultStreamPartId, ['contact-node'], ProxyDirection.PUBLISH, async () => 'publisher'),
            onewayNode.setProxies(defaultStreamPartId, ['contact-node'], ProxyDirection.PUBLISH, async () => 'publisher'),
            onewayNode.setProxies(defaultStreamPartId, ['contact-node'], ProxyDirection.PUBLISH, async () => 'publisher'),
        ])
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getOutboundNodesForStreamPart(defaultStreamPartId)).toContainValue('contact-node')
    })

    it('Published data is received using proxy publish stream connections', async () => {
        await onewayNode.setProxies(defaultStreamPartId, ['contact-node'], ProxyDirection.PUBLISH, async () => 'publisher')
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
        await onewayNode.setProxies(defaultStreamPartId, ['contact-node'], ProxyDirection.SUBSCRIBE, async () => 'subscriber')
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
        await onewayNode.setProxies(defaultStreamPartId, ['contact-node'], ProxyDirection.SUBSCRIBE, async () => 'subscriber')
        expect(() => onewayNode.publish(new StreamMessage({
            messageId: new MessageID(toStreamID('stream-0'), 0, 120, 0, PUBLISHER_ID, 'session'),
            content: {
                hello: 'world'
            },
            signature: 'signature'
        }))).toThrow('Cannot publish')
    })

    it('Cannot open a proxy publish stream connection to non-existing node (not connected to the streams tracker)', async () => {
        await expect(onewayNode.setProxies(defaultStreamPartId, ['non-contact-node'], ProxyDirection.PUBLISH, async () => 'publisher'))
            .rejects
            .toMatchObject(
                new Error(
                    'Joining stream as proxy publish failed on contact-node non-contact-node for stream stream-0#0'
                    + ' reason: Error: RTC error RTC_UNKNOWN_PEER while attempting to signal with node non-contact-node'
                )

            )
    })

    it('Cannot open a proxy subscribe stream connection to a node without an existing subscription to the given stream', async () => {
        await expect(onewayNode.setProxies(defaultStreamPartId, ['non-contact-node'], ProxyDirection.SUBSCRIBE, async () => 'subscriber'))
            .rejects
            .toMatchObject(
                new Error(
                    'Joining stream as proxy subscribe failed on contact-node non-contact-node for stream stream-0#0'
                    + ' reason: Error: RTC error RTC_UNKNOWN_PEER while attempting to signal with node non-contact-node'
                )
            )
    })

    it('If connection to any proxy node fails setProxies should reject', async () => {
        expect(() => onewayNode.setProxies(
            defaultStreamPartId,
            ['contact-node', 'contact-node-2', 'non-existing-node'],
            ProxyDirection.PUBLISH,
            async () => 'publisher')
        ).rejects.toThrow()
    })

    it('If publish only connection is the only stream connection on contact node it will not unsubscribe', async () => {
        await Promise.all([
            waitForEvent(contactNode, NodeEvent.NODE_UNSUBSCRIBED),
            contactNode2.unsubscribe(defaultStreamPartId)
        ])
        await onewayNode.setProxies(defaultStreamPartId, ['contact-node'], ProxyDirection.PUBLISH, async () => 'publisher')
        await Promise.all([
            waitForEvent(contactNode, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.setProxies(defaultStreamPartId, [], ProxyDirection.PUBLISH, async () => 'publisher'),
        ])
        // @ts-expect-error private
        expect(contactNode.streamPartManager.isSetUp(defaultStreamPartId)).toBeTrue()
    })

    it('will not connect above set target limit', async () => {
        await onewayNode.setProxies(
            defaultStreamPartId,
            ['contact-node', 'contact-node-2'],
            ProxyDirection.SUBSCRIBE,
            async () => 'subscriber',
            1
        )

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getInboundNodesForStreamPart(defaultStreamPartId)).toBeArrayOfSize(1)
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)
    })

    it('will connect up to a newly set target connection count', async () => {
        await onewayNode.setProxies(
            defaultStreamPartId,
            ['contact-node', 'contact-node-2'],
            ProxyDirection.SUBSCRIBE,
            async () => 'subscriber',
            1
        )

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getInboundNodesForStreamPart(defaultStreamPartId)).toBeArrayOfSize(1)
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)

        await onewayNode.setProxies(defaultStreamPartId,
            ['contact-node', 'contact-node-2'],
            ProxyDirection.SUBSCRIBE,
            async () => 'subscriber',
            2
        )

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getInboundNodesForStreamPart(defaultStreamPartId)).toBeArrayOfSize(2)
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)
    })

    it('will disconnect down to a newly set target connection count', async () => {
        await onewayNode.setProxies(
            defaultStreamPartId,
            ['contact-node', 'contact-node-2'],
            ProxyDirection.SUBSCRIBE,
            async () => 'subscriber',
            2
        )

        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getInboundNodesForStreamPart(defaultStreamPartId)).toBeArrayOfSize(2)
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)

        await onewayNode.setProxies(
            defaultStreamPartId,
            ['contact-node', 'contact-node-2'],
            ProxyDirection.SUBSCRIBE,
            async () => 'subscriber',
            1
        )
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getInboundNodesForStreamPart(defaultStreamPartId)).toBeArrayOfSize(1)
        // @ts-expect-error private
        expect(onewayNode.streamPartManager.getNeighborsForStreamPart(defaultStreamPartId)).toBeArrayOfSize(0)
    })

    it('will reconnect after lost connectivity', async () => {
        const restartContactNode = async () => {
            await contactNode.stop()
            await wait(20000)
            // eslint-disable-next-line require-atomic-updates
            contactNode = createContactNode()
            await contactNode.start()
            contactNode.subscribe(defaultStreamPartId)
        }
        await onewayNode.setProxies(defaultStreamPartId, ['contact-node'], ProxyDirection.PUBLISH, async () => 'publisher')

        await Promise.all([
            waitForEvent(onewayNode, NodeEvent.NODE_CONNECTED, 40000),
            restartContactNode()
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
    }, 60000)
})
