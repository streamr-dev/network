import { Tracker } from '../../src/logic/Tracker'
import { NetworkNode } from '../../src/NetworkNode'
import { MessageLayer, ControlLayer } from 'streamr-client-protocol'
import { waitForEvent, waitForStreamToEnd, toReadableStream } from 'streamr-test-utils'

import { startNetworkNode, startStorageNode, startTracker } from '../../src/composition'
import { Event as NodeEvent } from '../../src/logic/Node'
import { StreamIdAndPartition } from '../../src/identifiers'
import { MockStorageConfig } from './MockStorageConfig'

const { ControlMessage } = ControlLayer
const { StreamMessage, MessageID, MessageRef } = MessageLayer

const typesOfStreamItems = async (stream: NodeJS.ReadableStream) => {
    const arr = await waitForStreamToEnd(stream as any)
    return arr.map((msg: any) => msg.type)
}

/**
 * This test verifies that a node can fulfill resend requests at L3. A resend
 * request will be sent to contactNode. Being unable to fulfill the request,
 * it will forward it to its neighbors of which none will be able to fulfill
 * it either. Then L3 will kick in: contactNode will ask the tracker for
 * storage nodes, connect to one of them, and forward the request to the
 * connected storage node. Meanwhile contactNode will act as a proxy in
 * between the requesting client and the storage node.
 */
describe('resend requests are fulfilled at L3', () => {
    let tracker: Tracker
    let contactNode: NetworkNode
    let neighborOne: NetworkNode
    let neighborTwo: NetworkNode
    let storageNode: NetworkNode

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 28630,
            id: 'tracker'
        })
        contactNode = await startNetworkNode({
            host: '127.0.0.1',
            port: 28631,
            id: 'contactNode',
            trackers: [tracker.getAddress()],
            storages: [{
                store: () => {},
                requestLast: () => toReadableStream(),
                requestFrom: () => toReadableStream(),
                requestRange: () => toReadableStream(),
            }]
        })
        neighborOne = await startNetworkNode({
            host: '127.0.0.1',
            port: 28632,
            id: 'neighborOne',
            trackers: [tracker.getAddress()],
            storages: [{
                store: () => {},
                requestLast: () => toReadableStream(),
                requestFrom: () => toReadableStream(),
                requestRange: () => toReadableStream(),
            }]
        })
        neighborTwo = await startNetworkNode({
            host: '127.0.0.1',
            port: 28633,
            id: 'neighborTwo',
            trackers: [tracker.getAddress()],
            storages: []
        })
        const storageConfig = new MockStorageConfig()
        storageConfig.addStream(new StreamIdAndPartition('streamId', 0))
        storageNode = await startStorageNode({
            host: '127.0.0.1',
            port: 28634,
            id: 'storageNode',
            trackers: [tracker.getAddress()],
            storages: [{
                store: () => {},
                requestLast: () => toReadableStream(
                    new StreamMessage({
                        messageId: new MessageID('streamId', 0, 756, 0, 'publisherId', 'msgChainId'),
                        prevMsgRef: new MessageRef(666, 50),
                        content: {},
                    }),
                    new StreamMessage({
                        messageId: new MessageID('streamId', 0, 800, 0, 'publisherId', 'msgChainId'),
                        prevMsgRef: new MessageRef(756, 0),
                        content: {},
                    }),
                    new StreamMessage({
                        messageId: new MessageID('streamId', 0, 950, 0, 'publisherId', 'msgChainId'),
                        prevMsgRef: new MessageRef(800, 0),
                        content: {},
                    }),
                ),
                requestFrom: () => toReadableStream(
                    new StreamMessage({
                        messageId: new MessageID('streamId', 0, 666, 0, 'publisherId', 'msgChainId'),
                        content: {},
                    }),
                ),
                requestRange: () => toReadableStream(),
            }],
            storageConfig
        })

        neighborOne.subscribe('streamId', 0)
        neighborTwo.subscribe('streamId', 0)
        contactNode.subscribe('streamId', 0)

        // storageNode automatically assigned (subscribed) by tracker
        storageNode.start()
        neighborOne.start()
        neighborTwo.start()
        contactNode.start()

        await Promise.all([
            waitForEvent(contactNode, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(neighborOne, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(neighborTwo, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(storageNode, NodeEvent.NODE_SUBSCRIBED)
        ])
    })

    afterEach(async () => {
        await tracker.stop()
        await contactNode.stop()
        await neighborOne.stop()
        await neighborTwo.stop()
        await storageNode.stop()
    })

    test('requestResendLast', async () => {
        const stream = contactNode.requestResendLast('streamId', 0, 'requestId', 10)
        const events = await typesOfStreamItems(stream)
        expect(events).toEqual([
            ControlMessage.TYPES.UnicastMessage,
            ControlMessage.TYPES.UnicastMessage,
            ControlMessage.TYPES.UnicastMessage,
        ])
    })

    test('requestResendFrom', async () => {
        const stream = contactNode.requestResendFrom(
            'streamId',
            0,
            'requestId',
            666,
            0,
            'publisherId'
        )
        const events = await typesOfStreamItems(stream)
        expect(events).toEqual([
            ControlMessage.TYPES.UnicastMessage,
        ])
    })

    test('requestResendRange', async () => {
        const stream = contactNode.requestResendRange(
            'streamId',
            0,
            'requestId',
            666,
            0,
            999,
            0,
            'publisherId',
            'msgChainId'
        )
        const events = await typesOfStreamItems(stream)
        expect(events).toEqual([])
    })
})
