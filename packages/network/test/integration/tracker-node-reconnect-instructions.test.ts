import { Tracker } from '../../src/logic/Tracker'
import { NetworkNode } from '../../src/NetworkNode'
import { waitForEvent } from 'streamr-test-utils'
import { TrackerLayer } from 'streamr-client-protocol'

import { startNetworkNode, startTracker } from '../../src/composition'
import { Event as TrackerServerEvent } from '../../src/protocol/TrackerServer'
import { Event as NodeEvent } from '../../src/logic/Node'

/**
 * This test verifies that tracker can send instructions to node and node will connect and disconnect based on the instructions
 */
describe('Check tracker instructions to node', () => {
    let tracker: Tracker
    let nodeOne: NetworkNode
    let nodeTwo: NetworkNode
    const streamId = 'stream-1'

    beforeAll(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 30950,
            id: 'tracker'
        })

        nodeOne = await startNetworkNode({
            host: '127.0.0.1',
            port: 30952,
            id: 'node-1',
            trackers: [tracker.getAddress()],
            disconnectionWaitTime: 200
        })
        nodeTwo = await startNetworkNode({
            host: '127.0.0.1',
            port: 30953,
            id: 'node-2',
            trackers: [tracker.getAddress()],
            disconnectionWaitTime: 200
        })

        nodeOne.subscribe(streamId, 0)
        nodeTwo.subscribe(streamId, 0)

        nodeOne.start()
        nodeTwo.start()
    })

    afterAll(async () => {
        await nodeOne.stop()
        await nodeTwo.stop()
        await tracker.stop()
    })

    it('tracker should receive statuses from both nodes', (done) => {
        let receivedTotal = 0
        // @ts-expect-error private field
        tracker.trackerServer.on(TrackerServerEvent.NODE_STATUS_RECEIVED, () => {
            receivedTotal += 1

            if (receivedTotal === 2) {
                done()
            }
        })
    })

    it('if tracker sends empty list of nodes, node one will disconnect from node two', async () => {
        await Promise.all([
            waitForEvent(nodeOne, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(nodeTwo, NodeEvent.NODE_SUBSCRIBED)
        ])

        // @ts-expect-error private field
        expect(Object.keys(nodeOne.nodeToNode.endpoint.connections).length).toBe(1)
        // @ts-expect-error private field
        expect(Object.keys(nodeTwo.nodeToNode.endpoint.connections).length).toBe(1)

        // send empty list
        // @ts-expect-error private field
        await tracker.trackerServer.endpoint.send(
            'node-1',
            new TrackerLayer.InstructionMessage({
                requestId: 'requestId',
                streamId,
                streamPartition: 0,
                nodeIds: [],
                counter: 3
            }).serialize()
        )
        await waitForEvent(nodeOne, NodeEvent.NODE_UNSUBSCRIBED)

        // @ts-expect-error private field
        expect(nodeOne.trackerNode.endpoint.getPeers().size).toBe(1)

        nodeOne.unsubscribe(streamId, 0)
        await waitForEvent(nodeTwo, NodeEvent.NODE_UNSUBSCRIBED)

        // @ts-expect-error private field
        expect(Object.keys(nodeTwo.nodeToNode.endpoint.connections).length).toBe(1)
    })
})
