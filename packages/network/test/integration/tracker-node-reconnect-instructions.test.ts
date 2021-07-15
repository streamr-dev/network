import { Tracker } from '../../src/logic/Tracker'
import { NetworkNode } from '../../src/NetworkNode'
import { runAndWaitForEvents, waitForEvent } from 'streamr-test-utils'
import { TrackerLayer } from 'streamr-client-protocol'

import { createNetworkNode, startTracker } from '../../src/composition'
import { Event as TrackerServerEvent } from '../../src/protocol/TrackerServer'
import { Event as NodeEvent } from '../../src/logic/Node'
import { StreamIdAndPartition } from "../../src/identifiers"

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
        const trackerInfo = { id: 'tracker', ws: tracker.getUrl(), http: tracker.getUrl() }

        nodeOne = createNetworkNode({
            id: 'node-1',
            trackers: [trackerInfo],
            disconnectionWaitTime: 200
        })
        nodeTwo = createNetworkNode({
            id: 'node-2',
            trackers: [trackerInfo],
            disconnectionWaitTime: 200
        })

        nodeOne.subscribe(streamId, 0)
        nodeTwo.subscribe(streamId, 0)

        await Promise.all([
            nodeOne.start(),
            nodeTwo.start()
        ])
        
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

        const streamIdAndPartition = new StreamIdAndPartition(streamId, 0)

        // @ts-expect-error private field
        expect(nodeOne.streams.getAllNodesForStream(streamIdAndPartition).length).toBe(1)
        // @ts-expect-error private field
        expect(nodeTwo.streams.getAllNodesForStream(streamIdAndPartition).length).toBe(1)
        
        // send empty list and wait for expected events
        await runAndWaitForEvents([
            () => {
                // @ts-expect-error private field
                tracker.trackerServer.endpoint.send(
                    'node-1',
                    new TrackerLayer.InstructionMessage({
                        requestId: 'requestId',
                        streamId,
                        streamPartition: 0,
                        nodeIds: [],
                        counter: 3
                    }).serialize()
                )
            }], [
            [nodeOne, NodeEvent.NODE_UNSUBSCRIBED],
            [nodeTwo, NodeEvent.NODE_DISCONNECTED]
        ])

        // @ts-expect-error private field
        expect(nodeOne.streams.getAllNodesForStream(streamIdAndPartition).length).toBe(0)
        // @ts-expect-error private field
        expect(nodeTwo.streams.getAllNodesForStream(streamIdAndPartition).length).toBe(0)
    })
})
