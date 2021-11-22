import { NetworkNode } from '../../src/logic/node/NetworkNode'
import { Tracker } from '../../src/logic/tracker/Tracker'
import {MessageLayer, SPID} from 'streamr-client-protocol'
import { waitForCondition, waitForEvent } from 'streamr-test-utils'

import { createNetworkNode, startTracker } from '../../src/composition'
import {Event as NodeEvent, Node} from "../../src/logic/node/Node"

const { StreamMessage, MessageID } = MessageLayer

/**
 * This test verifies that on receiving a duplicate message, it is not re-emitted to the node's subscribers.
 */
describe('Publish only connection tests', () => {
    let tracker: Tracker
    let contactNode: NetworkNode
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

        nonContactNode = createNetworkNode({
            id: 'non-contact-node',
            trackers: [trackerInfo],
            stunUrls: []
        })
        await nonContactNode.start()

        await Promise.all([
            contactNode.subscribe('stream-0', 0),
            nonContactNode.subscribe('stream-0', 0),
            waitForEvent(contactNode, NodeEvent.NODE_SUBSCRIBED),
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
        await Promise.all([
            await contactNode.stop(),
            await nonContactNode.stop(),
            await publisherNode.stop(),
            await tracker.stop()
        ])
    })

    it('publisher node can form one-way connections', async () => {
        await publisherNode.joinStreamAsPurePublisher('stream-0', 0, 'contact-node')
        // @ts-expect-error private
        expect(publisherNode.streams.getOutboundNodesForStream(streamSPID)).toInclude('contact-node')
        // @ts-expect-error private
        console.log(publisherNode.streams.getNeighborsForStream(streamSPID))
    })

    it('publisher cannot connect to non-contact node', async () => {
        await publisherNode.joinStreamAsPurePublisher('stream-0', 0, 'non-contact-node')
        // @ts-expect-error private
        console.log(publisherNode.streams.getNeighborsForStream(streamSPID))
        // @ts-expect-error private
        expect(publisherNode.streams.getOutboundNodesForStream(streamSPID)).toBeArrayOfSize(0)
    })

    it('Published data is received using one-way stream connections', async () => {
        await publisherNode.joinStreamAsPurePublisher('stream-0', 0, 'contact-node')
        await Promise.all([
            publisherNode.publish(new StreamMessage({
                messageId: new MessageID('stream-0', 0, 120, 0, 'publisher', 'session'),
                content: {
                    hello: 'world'
                },
            })),
            waitForEvent(contactNode, NodeEvent.MESSAGE_RECEIVED)
        ])
        // @ts-expect-error private
        console.log(publisherNode.streams.getNeighborsForStream(streamSPID))
    })
})