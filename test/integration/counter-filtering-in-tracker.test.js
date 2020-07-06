const { wait, waitForEvent } = require('streamr-test-utils')

const { PeerInfo } = require('../../src/connection/PeerInfo')
const { startTracker } = require('../../src/composition')
const TrackerNode = require('../../src/protocol/TrackerNode')
const Tracker = require('../../src/logic/Tracker')
const { startEndpoint } = require('../../src/connection/WsEndpoint')
const { LOCALHOST } = require('../util')

const WAIT_TIME = 200

const formStatus = (counter1, counter2, nodes1, nodes2) => ({
    streams: {
        'stream-1::0': {
            inboundNodes: nodes1,
            outboundNodes: nodes1,
            counter: counter1
        },
        'stream-2::0': {
            inboundNodes: nodes2,
            outboundNodes: nodes2,
            counter: counter2
        }
    }
})

describe('tracker: counter filtering', () => {
    let tracker
    let trackerNode1
    let trackerNode2

    beforeEach(async () => {
        tracker = await startTracker(LOCALHOST, 30420, 'tracker')
        const endpoint1 = await startEndpoint('127.0.0.1', 30421, PeerInfo.newNode('trackerNode1'), null)
        const endpoint2 = await startEndpoint('127.0.0.1', 30422, PeerInfo.newNode('trackerNode2'), null)
        trackerNode1 = new TrackerNode(endpoint1)
        trackerNode2 = new TrackerNode(endpoint2)
        trackerNode1.connectToTracker(tracker.getAddress())
        trackerNode2.connectToTracker(tracker.getAddress())

        await Promise.all([
            waitForEvent(trackerNode1, TrackerNode.events.CONNECTED_TO_TRACKER),
            waitForEvent(trackerNode2, TrackerNode.events.CONNECTED_TO_TRACKER)
        ])

        // TODO: in the current version of the network, instructions are only sent to one of the
        //  participants. This means that counters of trackerNode2 will be left at (0, 0) whilst counters of
        //  trackerNode1 are incremented to be (1, 1). Thus this "reverse order" of sending statuses. This can be
        //  put back to "normal order" with WebRTC branch.
        trackerNode2.sendStatus('tracker', formStatus(0, 0, [], []))
        trackerNode1.sendStatus('tracker', formStatus(0, 0, [], []))

        await waitForEvent(trackerNode1, TrackerNode.events.TRACKER_INSTRUCTION_RECEIVED)
        await waitForEvent(trackerNode1, TrackerNode.events.TRACKER_INSTRUCTION_RECEIVED)
    })

    afterEach(async () => {
        await trackerNode1.stop()
        await trackerNode2.stop()
        await tracker.stop()
    })

    test('handles status messages with counters equal or more to current counter(s)', async () => {
        trackerNode1.sendStatus('tracker', formStatus(1, 666, [], []))

        let numOfInstructions = 0
        trackerNode1.on(TrackerNode.events.TRACKER_INSTRUCTION_RECEIVED, () => {
            numOfInstructions += 1
        })

        await wait(WAIT_TIME)
        expect(numOfInstructions).toEqual(2)
    })

    test('ignores status messages with counters less than current counter(s)', async () => {
        trackerNode1.sendStatus('tracker', formStatus(0, 0, [], []))

        let numOfInstructions = 0
        trackerNode1.on(TrackerNode.events.TRACKER_INSTRUCTION_RECEIVED, (fafa, baba) => {
            numOfInstructions += 1
        })

        await wait(WAIT_TIME)
        expect(numOfInstructions).toEqual(0)
    })

    test('partly handles status messages with mixed counters compared to current counters', async () => {
        trackerNode1.sendStatus('tracker', formStatus(1, 0, [], []))

        let numOfInstructions = 0
        trackerNode1.on(TrackerNode.events.TRACKER_INSTRUCTION_RECEIVED, () => {
            numOfInstructions += 1
        })

        await wait(WAIT_TIME)
        expect(numOfInstructions).toEqual(1)
    })
})
