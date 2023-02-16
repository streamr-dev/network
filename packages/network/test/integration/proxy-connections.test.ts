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
import { NodeId } from '../../src/identifiers'

const PUBLISHER_ID = toEthereumAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')

const streamPartId = StreamPartIDUtils.parse('stream-0#0')

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

    const getMockUserId = async () => 'mock-user-id'

    const getState = (node: NetworkNode) => {
        // @ts-expect-error private
        const streamPartManager = node.streamPartManager
        if (streamPartManager.isSetUp(streamPartId)) {
            return {
                isSetUp: true,
                inboundNodes: streamPartManager.getInboundNodesForStreamPart(streamPartId),
                outboundNodes: streamPartManager.getOutboundNodesForStreamPart(streamPartId),
                neighbors: streamPartManager.getNeighborsForStreamPart(streamPartId),
                hasInOnlyConnection: (otherNodeId: NodeId) => streamPartManager.hasInOnlyConnection(streamPartId, otherNodeId),
                hasOutOnlyConnection: (otherNodeId: NodeId) => streamPartManager.hasOutOnlyConnection(streamPartId, otherNodeId)
            }
        } else {
            return {
                isSetUp: false
            }
        }
    }

    beforeEach(async () => {
        tracker = await startTestTracker({
            port: 30353
        })
        trackerInfo = tracker.getConfigRecord()
        contactNode = createContactNode()
        contactNode.start()

        contactNode2 = createTestNetworkNode({
            id: 'contact-node-2',
            trackers: [trackerInfo],
            iceServers: [],
            acceptProxyConnections: true,
            webrtcDisallowPrivateAddresses: false
        })
        contactNode2.start()

        await Promise.all([
            contactNode.subscribe(streamPartId),
            contactNode2.subscribe(streamPartId),
            waitForEvent(contactNode, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(contactNode2, NodeEvent.NODE_SUBSCRIBED),
        ])

        onewayNode = createTestNetworkNode({
            id: 'publisher',
            trackers: [trackerInfo],
            iceServers: [],
            webrtcDisallowPrivateAddresses: false
        })
        onewayNode.start()
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
        await onewayNode.setProxies(streamPartId, ['contact-node', 'contact-node-2'], ProxyDirection.PUBLISH, getMockUserId)
        expect(getState(onewayNode).outboundNodes).toContainValues(['contact-node', 'contact-node-2'])
        expect(getState(onewayNode).neighbors).toBeArrayOfSize(0)
    })
    
    it('subscriber node can form proxy connections', async () => {
        await onewayNode.setProxies(streamPartId, ['contact-node', 'contact-node-2'], ProxyDirection.SUBSCRIBE, getMockUserId)
        expect(getState(onewayNode).inboundNodes).toContainValues(['contact-node', 'contact-node-2'])
        expect(getState(onewayNode).neighbors).toBeArrayOfSize(0)
    })

    it('publisher node can close proxy connections', async () => {
        await onewayNode.setProxies(streamPartId, ['contact-node', 'contact-node-2'], ProxyDirection.PUBLISH, getMockUserId)
        expect(getState(onewayNode).outboundNodes).toContainValues(['contact-node', 'contact-node-2'])
        expect(getState(onewayNode).neighbors).toBeArrayOfSize(0)

        await Promise.all([
            waitForEvent(contactNode, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.setProxies(streamPartId, ['contact-node-2'], ProxyDirection.PUBLISH, getMockUserId),
        ])

        expect(getState(onewayNode).hasOutOnlyConnection!('contact-node')).toBeFalse()
        expect(getState(onewayNode).hasOutOnlyConnection!('contact-node-2')).toBeTrue()

        await Promise.all([
            waitForEvent(contactNode2, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.setProxies(streamPartId, [], ProxyDirection.PUBLISH, getMockUserId),
        ])

        expect(getState(onewayNode).isSetUp).toBeFalse()
        expect(getState(contactNode).outboundNodes).toContainValues(['contact-node-2'])
        expect(getState(contactNode).hasInOnlyConnection!('publisher')).toBeFalse()
    })

    it('subscriber node can close proxy connections', async () => {
        await onewayNode.setProxies(streamPartId, ['contact-node', 'contact-node-2'], ProxyDirection.SUBSCRIBE, getMockUserId, 2)
        expect(getState(onewayNode).inboundNodes).toContainValues(['contact-node', 'contact-node-2'])
        expect(getState(onewayNode).neighbors).toBeArrayOfSize(0)

        await Promise.all([
            waitForEvent(contactNode, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.setProxies(streamPartId, ['contact-node-2'], ProxyDirection.SUBSCRIBE, getMockUserId),
        ])

        expect(getState(onewayNode).hasInOnlyConnection!('contact-node')).toBeFalse()
        expect(getState(onewayNode).hasInOnlyConnection!('contact-node-2')).toBeTrue()

        await Promise.all([
            waitForEvent(contactNode2, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.setProxies(streamPartId, [], ProxyDirection.SUBSCRIBE, getMockUserId),
        ])

        expect(getState(onewayNode).isSetUp).toBeFalse()
        expect(getState(contactNode).outboundNodes).toContainValues(['contact-node-2'])
        expect(getState(contactNode).hasOutOnlyConnection!('publisher')).toBeFalse()
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
            nonContactNode.subscribe(streamPartId)
        ])

        await expect(onewayNode.setProxies(streamPartId, ['non-contact-node'], ProxyDirection.PUBLISH, getMockUserId))
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
            waitForEvent(onewayNode.proxyStreamConnectionClient, ProxyEvent.CONNECTION_ACCEPTED),
            onewayNode.setProxies(streamPartId, ['contact-node'], ProxyDirection.PUBLISH, getMockUserId),
            onewayNode.setProxies(streamPartId, ['contact-node'], ProxyDirection.PUBLISH, getMockUserId),
            onewayNode.setProxies(streamPartId, ['contact-node'], ProxyDirection.PUBLISH, getMockUserId),
            onewayNode.setProxies(streamPartId, ['contact-node'], ProxyDirection.PUBLISH, getMockUserId),
        ])
        expect(getState(onewayNode).outboundNodes).toContainValue('contact-node')
    })

    it('Published data is received using proxy publish stream connections', async () => {
        await onewayNode.setProxies(streamPartId, ['contact-node'], ProxyDirection.PUBLISH, getMockUserId)
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
        await onewayNode.setProxies(streamPartId, ['contact-node'], ProxyDirection.SUBSCRIBE, getMockUserId)
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
        await onewayNode.setProxies(streamPartId, ['contact-node'], ProxyDirection.SUBSCRIBE, getMockUserId)
        expect(() => onewayNode.publish(new StreamMessage({
            messageId: new MessageID(toStreamID('stream-0'), 0, 120, 0, PUBLISHER_ID, 'session'),
            content: {
                hello: 'world'
            },
            signature: 'signature'
        }))).toThrow('Cannot publish')
    })

    it('Cannot open a proxy publish stream connection to non-existing node (not connected to the streams tracker)', async () => {
        await expect(onewayNode.setProxies(streamPartId, ['non-contact-node'], ProxyDirection.PUBLISH, getMockUserId))
            .rejects
            .toMatchObject(
                new Error(
                    'Joining stream as proxy publish failed on contact-node non-contact-node for stream stream-0#0'
                    + ' reason: Error: RTC error RTC_UNKNOWN_PEER while attempting to signal with node non-contact-node'
                )

            )
    })

    it('Cannot open a proxy subscribe stream connection to a node without an existing subscription to the given stream', async () => {
        await expect(onewayNode.setProxies(streamPartId, ['non-contact-node'], ProxyDirection.SUBSCRIBE, getMockUserId))
            .rejects
            .toMatchObject(
                new Error(
                    'Joining stream as proxy subscribe failed on contact-node non-contact-node for stream stream-0#0'
                    + ' reason: Error: RTC error RTC_UNKNOWN_PEER while attempting to signal with node non-contact-node'
                )
            )
    })

    it('If connection to any proxy node fails setProxies should reject', () => {
        expect(() => onewayNode.setProxies(
            streamPartId,
            ['contact-node', 'contact-node-2', 'non-existing-node'],
            ProxyDirection.PUBLISH,
            getMockUserId)
        ).rejects.toThrow()
    })

    it('If publish only connection is the only stream connection on contact node it will not unsubscribe', async () => {
        await Promise.all([
            waitForEvent(contactNode, NodeEvent.NODE_UNSUBSCRIBED),
            contactNode2.unsubscribe(streamPartId)
        ])
        await onewayNode.setProxies(streamPartId, ['contact-node'], ProxyDirection.PUBLISH, getMockUserId)
        await Promise.all([
            waitForEvent(contactNode, NodeEvent.ONE_WAY_CONNECTION_CLOSED),
            onewayNode.setProxies(streamPartId, [], ProxyDirection.PUBLISH, getMockUserId),
        ])
        expect(getState(contactNode).isSetUp).toBeTrue()
    })

    it('cannot set connection count above size of nodeIds array', async () => {
        await expect(onewayNode.setProxies(
            streamPartId,
            ['contact-node', 'contact-node-2'],
            ProxyDirection.SUBSCRIBE,
            getMockUserId,
            3
        )).rejects.toMatchObject(Error('Cannot set connectionCount above the size of the configured array of nodes'))
    })

    it('will not connect above set target limit', async () => {
        await onewayNode.setProxies(
            streamPartId,
            ['contact-node', 'contact-node-2'],
            ProxyDirection.SUBSCRIBE,
            getMockUserId,
            1
        )
        expect(getState(onewayNode).inboundNodes).toBeArrayOfSize(1)
        expect(getState(onewayNode).neighbors).toBeArrayOfSize(0)
    })

    it('will connect up to a newly set target connection count', async () => {
        await onewayNode.setProxies(
            streamPartId,
            ['contact-node', 'contact-node-2'],
            ProxyDirection.SUBSCRIBE,
            getMockUserId,
            1
        )

        expect(getState(onewayNode).inboundNodes).toBeArrayOfSize(1)
        expect(getState(onewayNode).neighbors).toBeArrayOfSize(0)

        await onewayNode.setProxies(streamPartId,
            ['contact-node', 'contact-node-2'],
            ProxyDirection.SUBSCRIBE,
            getMockUserId,
            2
        )

        expect(getState(onewayNode).inboundNodes).toBeArrayOfSize(2)
        expect(getState(onewayNode).neighbors).toBeArrayOfSize(0)
    })

    it('will disconnect down to a newly set target connection count', async () => {
        await onewayNode.setProxies(
            streamPartId,
            ['contact-node', 'contact-node-2'],
            ProxyDirection.SUBSCRIBE,
            getMockUserId,
            2
        )

        expect(getState(onewayNode).inboundNodes).toBeArrayOfSize(2)
        expect(getState(onewayNode).neighbors).toBeArrayOfSize(0)

        await onewayNode.setProxies(
            streamPartId,
            ['contact-node', 'contact-node-2'],
            ProxyDirection.SUBSCRIBE,
            getMockUserId,
            1
        )
        expect(getState(onewayNode).inboundNodes).toBeArrayOfSize(1)
        expect(getState(onewayNode).neighbors).toBeArrayOfSize(0)
    })

    it('will reconnect after lost connectivity', async () => {
        const restartContactNode = async () => {
            await contactNode.stop()
            await wait(20000)
            // eslint-disable-next-line require-atomic-updates
            contactNode = createContactNode()
            await contactNode.start()
            contactNode.subscribe(streamPartId)
        }
        await onewayNode.setProxies(streamPartId, ['contact-node'], ProxyDirection.PUBLISH, getMockUserId)

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
    }, 45000)
})
