import { Tracker } from '../../src/logic/tracker/Tracker'
import { NetworkNode } from '../../src/logic/node/NetworkNode'
import { waitForEvent, eventsWithArgsToArray, wait } from 'streamr-test-utils'
import { SPID, TrackerLayer } from 'streamr-client-protocol'

import { createNetworkNode, startTracker } from '../../src/composition'
import { Event as NodeToTrackerEvent } from '../../src/protocol/NodeToTracker'
import { Event as NodeEvent } from '../../src/logic/node/Node'
import { getSPIDKeys } from '../utils'

// TODO: maybe worth re-designing this in a way that isn't this arbitrary?
const FIRST_STREAM = 'a-0' // assigned to trackerOne (arbitrarily by hashing algo)
const SECOND_STREAM = 'b-8' // assigned to trackerTwo
const THIRD_STREAM = 'c-2' // assigned to trackerThree

const FIRST_STREAM_2 = 'e-1' // assigned to trackerOne
const SECOND_STREAM_2 = 'f-3' // assigned to trackerTwo
const THIRD_STREAM_2 = 'g-0' // assigned to trackerThree

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
        trackerOne = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 49000
            },
            id: 'trackerOne'
        })
        trackerTwo = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 49001
            },
            id: 'trackerTwo',
        })
        trackerThree = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 49002
            },
            id: 'trackerThree'
        })
        const trackerInfo1 = { id: 'trackerOne', ws: trackerOne.getUrl(), http: trackerOne.getUrl() }
        const trackerInfo2 = { id: 'trackerTwo', ws: trackerTwo.getUrl(), http: trackerTwo.getUrl() }
        const trackerInfo3 = { id: 'trackerThree', ws: trackerThree.getUrl(), http: trackerThree.getUrl() }

        const trackerAddresses = [trackerInfo1, trackerInfo2, trackerInfo3]
        nodeOne = createNetworkNode({
            id: 'nodeOne',
            trackers: trackerAddresses,
            trackerConnectionMaintenanceInterval: 100
        })
        nodeTwo = createNetworkNode({
            id: 'nodeTwo',
            trackers: trackerAddresses,
            trackerConnectionMaintenanceInterval: 100
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
        nodeOne.subscribe(new SPID(FIRST_STREAM, 0))

        await wait(500)

        expect(getSPIDKeys(trackerOne)).toContain(`${FIRST_STREAM}#0`)
        expect(getSPIDKeys(trackerTwo)).not.toContain(`${FIRST_STREAM}#0`)
        expect(getSPIDKeys(trackerThree)).not.toContain(`${FIRST_STREAM}#0`)

        // second stream, second tracker
        nodeOne.subscribe(new SPID(SECOND_STREAM, 0))

        await wait(500)

        expect(getSPIDKeys(trackerOne)).not.toContain(`${SECOND_STREAM}#0`)
        expect(getSPIDKeys(trackerTwo)).toContain(`${SECOND_STREAM}#0`)
        expect(getSPIDKeys(trackerThree)).not.toContain(`${SECOND_STREAM}#0`)

        // third stream, third tracker
        nodeOne.subscribe(new SPID(THIRD_STREAM, 0))

        await wait(500)

        expect(getSPIDKeys(trackerOne)).not.toContain(`${THIRD_STREAM}#0`)
        expect(getSPIDKeys(trackerTwo)).not.toContain(`${THIRD_STREAM}#0`)
        expect(getSPIDKeys(trackerThree)).toContain(`${THIRD_STREAM}#0`)
    })

    test('only one specific tracker sends instructions about stream', async () => {
        // first stream, first tracker
        nodeOne.subscribe(new SPID(FIRST_STREAM_2, 0))
        nodeTwo.subscribe(new SPID(FIRST_STREAM_2, 0))

        // @ts-expect-error private field
        let nodeOneEvents = eventsWithArgsToArray(nodeOne.trackerManager.nodeToTracker, TRACKER_NODE_EVENTS_OF_INTEREST)
        // @ts-expect-error private field
        let nodeTwoEvents = eventsWithArgsToArray(nodeTwo.trackerManager.nodeToTracker, TRACKER_NODE_EVENTS_OF_INTEREST)

        await Promise.all([
            waitForEvent(nodeOne, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(nodeTwo, NodeEvent.NODE_SUBSCRIBED)
        ])

        expect(nodeOneEvents).toHaveLength(2)
        expect(nodeTwoEvents).toHaveLength(2)
        expect(nodeTwoEvents[1][0]).toEqual(NodeToTrackerEvent.TRACKER_INSTRUCTION_RECEIVED)
        expect(nodeTwoEvents[1][2]).toEqual('trackerOne')

        // second stream, second tracker
        nodeOne.subscribe(new SPID(SECOND_STREAM_2, 0))
        nodeTwo.subscribe(new SPID(SECOND_STREAM_2, 0))

        // @ts-expect-error private field
        nodeOneEvents = eventsWithArgsToArray(nodeOne.trackerManager.nodeToTracker, TRACKER_NODE_EVENTS_OF_INTEREST)
        // @ts-expect-error private field
        nodeTwoEvents = eventsWithArgsToArray(nodeTwo.trackerManager.nodeToTracker, TRACKER_NODE_EVENTS_OF_INTEREST)

        await Promise.all([
            waitForEvent(nodeOne, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(nodeTwo, NodeEvent.NODE_SUBSCRIBED)
        ])

        expect(nodeOneEvents).toHaveLength(2)
        expect(nodeTwoEvents).toHaveLength(2)
        expect(nodeTwoEvents[1][0]).toEqual(NodeToTrackerEvent.TRACKER_INSTRUCTION_RECEIVED)
        expect(nodeTwoEvents[1][2]).toEqual('trackerTwo')

        // third stream, third tracker
        nodeOne.subscribe(new SPID(THIRD_STREAM_2, 0))
        nodeTwo.subscribe(new SPID(THIRD_STREAM_2, 0))

        // @ts-expect-error private field
        nodeOneEvents = eventsWithArgsToArray(nodeOne.trackerManager.nodeToTracker, TRACKER_NODE_EVENTS_OF_INTEREST)
        // @ts-expect-error private field
        nodeTwoEvents = eventsWithArgsToArray(nodeTwo.trackerManager.nodeToTracker, TRACKER_NODE_EVENTS_OF_INTEREST)

        await Promise.all([
            waitForEvent(nodeOne, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(nodeTwo, NodeEvent.NODE_SUBSCRIBED)
        ])

        expect(nodeOneEvents).toHaveLength(2)
        expect(nodeTwoEvents).toHaveLength(2)
        expect(nodeTwoEvents[1][0]).toEqual(NodeToTrackerEvent.TRACKER_INSTRUCTION_RECEIVED)
        expect(nodeTwoEvents[1][2]).toEqual('trackerThree')
    })

    test('node ignores instructions from unexpected tracker', async () => {
        const unexpectedInstruction = new TrackerLayer.InstructionMessage({
            requestId: 'requestId',
            streamId: 'stream-2',
            streamPartition: 0,
            nodeIds: [
                'node-address-1',
                'node-address-2',
            ],
            counter: 0
        })
        // @ts-expect-error private field
        await nodeOne.trackerManager.handleTrackerInstruction(unexpectedInstruction, 'trackerOne')
        expect(getSPIDKeys(nodeOne)).not.toContain('stream-2#0')
    })
})
