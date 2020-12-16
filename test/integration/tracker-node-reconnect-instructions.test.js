const { waitForEvent } = require('streamr-test-utils')
const { TrackerLayer } = require('streamr-client-protocol')

const { startNetworkNode, startTracker } = require('../../src/composition')
const { Event: TrackerServerEvent } = require('../../src/protocol/TrackerServer')
const { Event: NodeEvent } = require('../../src/logic/Node')
const { Event: TrackerNodeEvent } = require('../../src/protocol/TrackerNode')
const WsEndpoint = require('../../src/connection/WsEndpoint')

/**
 * This test verifies that tracker can send instructions to node and node will connect and disconnect based on the instructions
 */
describe('Check tracker instructions to node', () => {
    let tracker
    let nodeOne
    let nodeTwo
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
        // send empty list
        await tracker.trackerServer.endpoint.send(
            'node-1',
            new TrackerLayer.InstructionMessage({
                requestId: 'requestId',
                streamId,
                streamPartition: 0,
                nodeIds: [],
                counter: 0
            }).serialize()
        )

        await waitForEvent(nodeOne.trackerNode, TrackerNodeEvent.TRACKER_INSTRUCTION_RECEIVED)
        await waitForEvent(nodeOne, NodeEvent.NODE_DISCONNECTED)

        expect(nodeOne.trackerNode.endpoint.getPeers().size).toBe(1)

        nodeOne.unsubscribe(streamId, 0)

        await waitForEvent(nodeTwo.nodeToNode.endpoint, WsEndpoint.Event.PEER_DISCONNECTED)
        expect(nodeTwo.trackerNode.endpoint.getPeers().size).toBe(1)
    })
})
