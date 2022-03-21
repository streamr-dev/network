import { Tracker, startTracker } from 'streamr-network-tracker'
import { NetworkNode } from '../../dist/src/logic/NetworkNode'
import { waitForEvent, eventsWithArgsToArray, wait } from 'streamr-test-utils'
import { TrackerLayer, toStreamID, toStreamPartID } from 'streamr-client-protocol'

import { createNetworkNode } from 'streamr-network'
import { Event as NodeToTrackerEvent } from '../../src/protocol/NodeToTracker'
import { Event as NodeEvent } from '../../src/logic/Node'
import { getStreamParts } from '../utils'

// TODO: maybe worth re-designing this in a way that isn't this arbitrary?
const FIRST_STREAM = toStreamID('stream-7') // assigned to trackerOne (arbitrarily by hashing algo)
const SECOND_STREAM = toStreamID('stream-8') // assigned to trackerTwo
const THIRD_STREAM = toStreamID('stream-1') // assigned to trackerThree

const FIRST_STREAM_2 = toStreamID('stream-13') // assigned to trackerOne
const SECOND_STREAM_2 = toStreamID('stream-17') // assigned to trackerTwo
const THIRD_STREAM_2 = toStreamID('stream-21') // assigned to trackerThree

// Leave out WebRTC related events
const TRACKER_NODE_EVENTS_OF_INTEREST = [
    NodeToTrackerEvent.CONNECTED_TO_TRACKER,
    NodeToTrackerEvent.TRACKER_DISCONNECTED,
    NodeToTrackerEvent.TRACKER_INSTRUCTION_RECEIVED
]

describe('multi trackers', () => {
    let trackerOne: Tracker
    let trackerTwo: Tracker
    let trackerThree: Tracker
    let nodeOne: NetworkNode
    let nodeTwo: NetworkNode

    beforeEach(async () => {
        // console.log(require('streamr-network-tracker'))
        trackerOne = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 49000
            }
        })
        trackerTwo = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 49001
            }
        })
        trackerThree = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 49002
            }
        })
        const trackerInfo1 = trackerOne.getConfigRecord()
        const trackerInfo2 = trackerTwo.getConfigRecord()
        const trackerInfo3 = trackerThree.getConfigRecord()

        const trackerAddresses = [trackerInfo1, trackerInfo2, trackerInfo3]
        nodeOne = createNetworkNode({
            id: 'nodeOne',
            trackers: trackerAddresses,
            trackerConnectionMaintenanceInterval: 100,
            webrtcDisallowPrivateAddresses: false
        })
        nodeTwo = createNetworkNode({
            id: 'nodeTwo',
            trackers: trackerAddresses,
            trackerConnectionMaintenanceInterval: 100,
            webrtcDisallowPrivateAddresses: false
        })

        await nodeOne.start()
        await nodeTwo.start()

    })

    afterEach(async () => {
        await nodeOne.stop()
        await nodeTwo.stop()

        await trackerOne.stop()
        await trackerTwo.stop()
        await trackerThree.stop()
    })

    test('node sends stream status to specific tracker', async () => {
        // first stream, first tracker
        nodeOne.subscribe(toStreamPartID(FIRST_STREAM, 0))

        await wait(500)

        expect(getStreamParts(trackerOne)).toContain(`${FIRST_STREAM}#0`)
        expect(getStreamParts(trackerTwo)).not.toContain(`${FIRST_STREAM}#0`)
        expect(getStreamParts(trackerThree)).not.toContain(`${FIRST_STREAM}#0`)

        // second stream, second tracker
        nodeOne.subscribe(toStreamPartID(SECOND_STREAM, 0))

        await wait(500)

        expect(getStreamParts(trackerOne)).not.toContain(`${SECOND_STREAM}#0`)
        expect(getStreamParts(trackerTwo)).toContain(`${SECOND_STREAM}#0`)
        expect(getStreamParts(trackerThree)).not.toContain(`${SECOND_STREAM}#0`)

        // third stream, third tracker
        nodeOne.subscribe(toStreamPartID(THIRD_STREAM, 0))

        await wait(500)

        expect(getStreamParts(trackerOne)).not.toContain(`${THIRD_STREAM}#0`)
        expect(getStreamParts(trackerTwo)).not.toContain(`${THIRD_STREAM}#0`)
        expect(getStreamParts(trackerThree)).toContain(`${THIRD_STREAM}#0`)
    })

    test('only one specific tracker sends instructions about stream', async () => {
        
        const nodePromise = Promise.all([
            waitForEvent(nodeOne, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(nodeTwo, NodeEvent.NODE_SUBSCRIBED)
        ])

        // @ts-expect-error private field
        let nodeOneEvents = eventsWithArgsToArray(nodeOne.trackerManager.nodeToTracker, TRACKER_NODE_EVENTS_OF_INTEREST)
        // @ts-expect-error private field
        let nodeTwoEvents = eventsWithArgsToArray(nodeTwo.trackerManager.nodeToTracker, TRACKER_NODE_EVENTS_OF_INTEREST)

        // first stream, first tracker
        nodeOne.subscribe(toStreamPartID(FIRST_STREAM_2, 0))
        nodeTwo.subscribe(toStreamPartID(FIRST_STREAM_2, 0))

        await nodePromise

        expect(nodeOneEvents).toHaveLength(2)
        expect(nodeTwoEvents).toHaveLength(2)
        expect(nodeTwoEvents[1][0]).toEqual(NodeToTrackerEvent.TRACKER_INSTRUCTION_RECEIVED)
        expect(nodeTwoEvents[1][2]).toEqual(trackerOne.getTrackerId())

        const nodePromise2 = Promise.all([
            waitForEvent(nodeOne, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(nodeTwo, NodeEvent.NODE_SUBSCRIBED)
        ])

        // @ts-expect-error private field
        nodeOneEvents = eventsWithArgsToArray(nodeOne.trackerManager.nodeToTracker, TRACKER_NODE_EVENTS_OF_INTEREST)
        // @ts-expect-error private field
        nodeTwoEvents = eventsWithArgsToArray(nodeTwo.trackerManager.nodeToTracker, TRACKER_NODE_EVENTS_OF_INTEREST)

        // second stream, second tracker
        nodeOne.subscribe(toStreamPartID(SECOND_STREAM_2, 0))
        nodeTwo.subscribe(toStreamPartID(SECOND_STREAM_2, 0))

        await nodePromise2

        expect(nodeOneEvents).toHaveLength(2)
        expect(nodeTwoEvents).toHaveLength(2)
        expect(nodeTwoEvents[1][0]).toEqual(NodeToTrackerEvent.TRACKER_INSTRUCTION_RECEIVED)
        expect(nodeTwoEvents[1][2]).toEqual(trackerTwo.getTrackerId())

        const nodePromise3 = Promise.all([
            waitForEvent(nodeOne, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(nodeTwo, NodeEvent.NODE_SUBSCRIBED)
        ])

        // @ts-expect-error private field
        nodeOneEvents = eventsWithArgsToArray(nodeOne.trackerManager.nodeToTracker, TRACKER_NODE_EVENTS_OF_INTEREST)
        // @ts-expect-error private field
        nodeTwoEvents = eventsWithArgsToArray(nodeTwo.trackerManager.nodeToTracker, TRACKER_NODE_EVENTS_OF_INTEREST)

        // third stream, third tracker
        nodeOne.subscribe(toStreamPartID(THIRD_STREAM_2, 0))
        nodeTwo.subscribe(toStreamPartID(THIRD_STREAM_2, 0))

        await nodePromise3

        expect(nodeOneEvents).toHaveLength(2)
        expect(nodeTwoEvents).toHaveLength(2)
        expect(nodeTwoEvents[1][0]).toEqual(NodeToTrackerEvent.TRACKER_INSTRUCTION_RECEIVED)
        expect(nodeTwoEvents[1][2]).toEqual(trackerThree.getTrackerId())
    })

    test('node ignores instructions from unexpected tracker', async () => {
        const unexpectedInstruction = new TrackerLayer.InstructionMessage({
            requestId: 'requestId',
            streamId: toStreamID('stream-2'),
            streamPartition: 0,
            nodeIds: [
                'node-address-1',
                'node-address-2',
            ],
            counter: 0
        })
        // @ts-expect-error private field
        await nodeOne.trackerManager.handleTrackerInstruction(unexpectedInstruction, trackerOne.getTrackerId())
        expect(getStreamParts(nodeOne)).not.toContain('stream-2#0')
    })
})
