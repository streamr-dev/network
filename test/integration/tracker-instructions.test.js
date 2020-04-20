const { waitForEvent } = require('streamr-test-utils')

const { startNetworkNode, startTracker } = require('../../src/composition')
const TrackerServer = require('../../src/protocol/TrackerServer')
const Node = require('../../src/logic/Node')
const { LOCALHOST } = require('../util')
const { StreamIdAndPartition } = require('../../src/identifiers')
const encoder = require('../../src/helpers/MessageEncoder')

describe('check tracker, nodes and statuses from nodes', () => {
    let tracker
    const trackerPort = 32900

    let node1
    const port1 = 33971

    let node2
    const port2 = 33972

    const s1 = new StreamIdAndPartition('stream-1', 0)

    beforeEach(async () => {
        tracker = await startTracker(LOCALHOST, trackerPort, 'tracker')
        // disable trackers formAndSendInstructions function
        // eslint-disable-next-line no-underscore-dangle
        tracker._formAndSendInstructions = () => {}
        node1 = await startNetworkNode(LOCALHOST, port1, 'node1')
        node2 = await startNetworkNode(LOCALHOST, port2, 'node2')

        node1.subscribeToStreamIfHaveNotYet(s1)
        node2.subscribeToStreamIfHaveNotYet(s1)

        node1.addBootstrapTracker(tracker.getAddress())
        node2.addBootstrapTracker(tracker.getAddress())

        await Promise.all([
            waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        ])
    })

    afterEach(async () => {
        await node1.stop()
        await node2.stop()
        await tracker.stop()
    })

    it('if failed to follow tracker instructions, inform tracker about current status', async () => {
        const trackerInstruction = encoder.instructionMessage(s1, [
            `ws://${LOCALHOST}:${port1}`,
            `ws://${LOCALHOST}:${port2}`,
            'OOPS'
        ])

        await node1.onTrackerInstructionReceived('tracker', encoder.decode('tracker', trackerInstruction))
        await node2.onTrackerInstructionReceived('tracker', encoder.decode('tracker', trackerInstruction))

        await Promise.race([
            waitForEvent(node1, Node.events.NODE_SUBSCRIBED),
            waitForEvent(node2, Node.events.NODE_SUBSCRIBED)
        ])

        await Promise.all([
            waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        ])

        expect(tracker.getTopology()).toEqual({
            'stream-1::0': {
                node1: ['node2'],
                node2: ['node1'],
            }
        })

        expect([...node1.protocols.nodeToNode.endpoint.getPeers().keys()]).toEqual([
            `ws://${LOCALHOST}:${trackerPort}`, `ws://${LOCALHOST}:${port2}`
        ])
        expect([...node2.protocols.nodeToNode.endpoint.getPeers().keys()]).toEqual([
            `ws://${LOCALHOST}:${trackerPort}`, `ws://${LOCALHOST}:${port1}`
        ])
    })
})
