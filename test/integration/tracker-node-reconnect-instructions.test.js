const { waitForEvent } = require('streamr-test-utils')
const { TrackerLayer } = require('streamr-client-protocol')

const { startNetworkNode, startTracker } = require('../../src/composition')
const TrackerServer = require('../../src/protocol/TrackerServer')
const Node = require('../../src/logic/Node')
const TrackerNode = require('../../src/protocol/TrackerNode')
const endpointEvents = require('../../src/connection/WsEndpoint').events
const { disconnectionReasons } = require('../../src/connection/WsEndpoint')

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

        nodeOne = await startNetworkNode('127.0.0.1', 30952, 'node-1')
        nodeTwo = await startNetworkNode('127.0.0.1', 30953, 'node-2')

        // TODO: a better way of achieving this would be to pass via constructor, but currently not possible when using
        // startNetworkNode function
        nodeOne.opts.disconnectionWaitTime = 200
        nodeTwo.opts.disconnectionWaitTime = 200

        nodeOne.subscribe(streamId, 0)
        nodeTwo.subscribe(streamId, 0)

        nodeOne.addBootstrapTracker(tracker.getAddress())
        nodeTwo.addBootstrapTracker(tracker.getAddress())
    })

    afterAll(async () => {
        await nodeOne.stop()
        await nodeTwo.stop()
        await tracker.stop()
    })

    it('tracker should receive statuses from both nodes', (done) => {
        let receivedTotal = 0
        tracker.protocols.trackerServer.on(TrackerServer.events.NODE_STATUS_RECEIVED, () => {
            receivedTotal += 1

            if (receivedTotal === 2) {
                done()
            }
        })
    })

    it('if tracker sends empty list of nodes, node one will disconnect from node two', async () => {
        await Promise.all([
            waitForEvent(nodeOne, Node.events.NODE_SUBSCRIBED),
            waitForEvent(nodeTwo, Node.events.NODE_SUBSCRIBED)
        ])
        // send empty list
        await tracker.protocols.trackerServer.endpoint.sendSync(
            'node-1',
            new TrackerLayer.InstructionMessage({
                requestId: 'requestId',
                streamId,
                streamPartition: 0,
                nodeAddresses: [],
                counter: 0
            }).serialize()
        )

        await waitForEvent(nodeOne.protocols.trackerNode, TrackerNode.events.TRACKER_INSTRUCTION_RECEIVED)
        await waitForEvent(nodeOne, Node.events.NODE_DISCONNECTED)

        expect(nodeOne.protocols.trackerNode.endpoint.getPeers().size).toBe(1)

        nodeOne.unsubscribe(streamId, 0)

        const msg = await waitForEvent(nodeTwo.protocols.nodeToNode.endpoint, endpointEvents.PEER_DISCONNECTED)
        expect(msg[1]).toBe(disconnectionReasons.NO_SHARED_STREAMS)
        expect(nodeTwo.protocols.trackerNode.endpoint.getPeers().size).toBe(1)
    })
})
