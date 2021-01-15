import { Tracker } from '../../src/logic/Tracker'
import { NetworkNode } from '../../src/NetworkNode'
import { waitForEvent, eventsWithArgsToArray } from 'streamr-test-utils'
import { TrackerLayer } from 'streamr-client-protocol'

import { startNetworkNode, startTracker } from '../../src/composition'
import { Event as TrackerServerEvent } from '../../src/protocol/TrackerServer'
import { Event as TrackerNodeEvent } from '../../src/protocol/TrackerNode'
import { Node, Event as NodeEvent } from '../../src/logic/Node'

// TODO: maybe worth re-designing this in a way that isn't this arbitrary?
const FIRST_STREAM = 'stream-1' // assigned to trackerOne (arbitrarily by hashing algo)
const SECOND_STREAM = 'stream-8' // assigned to trackerTwo
const THIRD_STREAM = 'stream-9' // assigned to trackerThree

const FIRST_STREAM_2 = 'stream-12'
const SECOND_STREAM_2 = 'stream-10'
const THIRD_STREAM_2 = 'stream-11'

// Leave out WebRTC related events
const TRACKER_NODE_EVENTS_OF_INTEREST = [
    TrackerNodeEvent.CONNECTED_TO_TRACKER,
    TrackerNodeEvent.TRACKER_DISCONNECTED,
    TrackerNodeEvent.TRACKER_INSTRUCTION_RECEIVED,
    TrackerNodeEvent.STORAGE_NODES_RESPONSE_RECEIVED
]

describe('multi trackers', () => {
    let trackerOne: Tracker
    let trackerTwo: Tracker
    let trackerThree: Tracker
    let nodeOne: NetworkNode
    let nodeTwo: NetworkNode

    beforeAll(async () => {
        trackerOne = await startTracker({
            host: '127.0.0.1',
            port: 49000,
            id: 'trackerOne'
        })
        trackerTwo = await startTracker({
            host: '127.0.0.1',
            port: 49001,
            id: 'trackerTwo'
        })
        trackerThree = await startTracker({
            host: '127.0.0.1',
            port: 49002,
            id: 'trackerThree'
        })
        const trackerAddresses = [trackerOne.getAddress(), trackerTwo.getAddress(), trackerThree.getAddress()]
        nodeOne = await startNetworkNode({
            host: '127.0.0.1',
            port: 49003,
            id: 'nodeOne',
            trackers: trackerAddresses
        })
        nodeTwo = await startNetworkNode({
            host: '127.0.0.1',
            port: 49004,
            id: 'nodeTwo',
            trackers: trackerAddresses
        })

        nodeOne.start()
        await Promise.all([
            // @ts-expect-error private field
            waitForEvent(trackerOne.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED),
            // @ts-expect-error private field
            waitForEvent(trackerTwo.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED),
            // @ts-expect-error private field
            waitForEvent(trackerThree.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED)
        ])

        nodeTwo.start()
        await Promise.all([
            // @ts-expect-error private field
            waitForEvent(trackerOne.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED),
            // @ts-expect-error private field
            waitForEvent(trackerTwo.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED),
            // @ts-expect-error private field
            waitForEvent(trackerThree.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED)
        ])
    })

    afterAll(async () => {
        await nodeOne.stop()
        await nodeTwo.stop()

        await trackerOne.stop()
        await trackerTwo.stop()
        await trackerThree.stop()
    })

    test('node sends stream status to specific tracker', async () => {
        // first stream, first tracker
        nodeOne.subscribe(FIRST_STREAM, 0)

        await Promise.race([
            // @ts-expect-error private field
            waitForEvent(trackerOne.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED),
            // @ts-expect-error private field
            waitForEvent(trackerTwo.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED),
            // @ts-expect-error private field
            waitForEvent(trackerThree.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED),
        ])

        expect(trackerOne.getStreams()).toContain(`${FIRST_STREAM}::0`)
        expect(trackerTwo.getStreams()).not.toContain(`${FIRST_STREAM}::0`)
        expect(trackerThree.getStreams()).not.toContain(`${FIRST_STREAM}::0`)

        // second stream, second tracker
        nodeOne.subscribe(SECOND_STREAM, 0)

        await Promise.race([
            // @ts-expect-error private field
            waitForEvent(trackerOne.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED),
            // @ts-expect-error private field
            waitForEvent(trackerTwo.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED),
            // @ts-expect-error private field
            waitForEvent(trackerThree.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED),
        ])

        expect(trackerOne.getStreams()).not.toContain(`${SECOND_STREAM}::0`)
        expect(trackerTwo.getStreams()).toContain(`${SECOND_STREAM}::0`)
        expect(trackerThree.getStreams()).not.toContain(`${SECOND_STREAM}::0`)

        // third stream, third tracker
        nodeOne.subscribe(THIRD_STREAM, 0)

        await Promise.race([
            // @ts-expect-error private field
            waitForEvent(trackerOne.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED),
            // @ts-expect-error private field
            waitForEvent(trackerTwo.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED),
            // @ts-expect-error private field
            waitForEvent(trackerThree.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED),
        ])

        expect(trackerOne.getStreams()).not.toContain(`${THIRD_STREAM}::0`)
        expect(trackerTwo.getStreams()).not.toContain(`${THIRD_STREAM}::0`)
        expect(trackerThree.getStreams()).toContain(`${THIRD_STREAM}::0`)
    })

    test('only one specific tracker sends instructions about stream', async () => {
        // first stream, first tracker
        nodeOne.subscribe(FIRST_STREAM_2, 0)
        nodeTwo.subscribe(FIRST_STREAM_2, 0)

        // @ts-expect-error private field
        let nodeOneEvents = eventsWithArgsToArray(nodeOne.trackerNode, TRACKER_NODE_EVENTS_OF_INTEREST)
        // @ts-expect-error private field
        let nodeTwoEvents = eventsWithArgsToArray(nodeTwo.trackerNode, TRACKER_NODE_EVENTS_OF_INTEREST)

        await Promise.all([
            waitForEvent(nodeOne, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(nodeTwo, NodeEvent.NODE_SUBSCRIBED)
        ])

        expect(nodeOneEvents).toHaveLength(1)
        expect(nodeTwoEvents).toHaveLength(1)
        expect(nodeTwoEvents[0][0]).toEqual(TrackerNodeEvent.TRACKER_INSTRUCTION_RECEIVED)
        expect(nodeTwoEvents[0][2]).toEqual('trackerOne')

        // second stream, second tracker
        nodeOne.subscribe(SECOND_STREAM_2, 0)
        nodeTwo.subscribe(SECOND_STREAM_2, 0)

        // @ts-expect-error private field
        nodeOneEvents = eventsWithArgsToArray(nodeOne.trackerNode, TRACKER_NODE_EVENTS_OF_INTEREST)
        // @ts-expect-error private field
        nodeTwoEvents = eventsWithArgsToArray(nodeTwo.trackerNode, TRACKER_NODE_EVENTS_OF_INTEREST)

        await Promise.all([
            waitForEvent(nodeOne, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(nodeTwo, NodeEvent.NODE_SUBSCRIBED)
        ])

        expect(nodeOneEvents).toHaveLength(1)
        expect(nodeTwoEvents).toHaveLength(1)
        expect(nodeTwoEvents[0][0]).toEqual(TrackerNodeEvent.TRACKER_INSTRUCTION_RECEIVED)
        expect(nodeTwoEvents[0][2]).toEqual('trackerTwo')

        // third stream, third tracker
        nodeOne.subscribe(THIRD_STREAM_2, 0)
        nodeTwo.subscribe(THIRD_STREAM_2, 0)

        // @ts-expect-error private field
        nodeOneEvents = eventsWithArgsToArray(nodeOne.trackerNode, TRACKER_NODE_EVENTS_OF_INTEREST)
        // @ts-expect-error private field
        nodeTwoEvents = eventsWithArgsToArray(nodeTwo.trackerNode, TRACKER_NODE_EVENTS_OF_INTEREST)

        await Promise.all([
            waitForEvent(nodeOne, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(nodeTwo, NodeEvent.NODE_SUBSCRIBED)
        ])

        expect(nodeOneEvents).toHaveLength(1)
        expect(nodeTwoEvents).toHaveLength(1)
        expect(nodeTwoEvents[0][0]).toEqual(TrackerNodeEvent.TRACKER_INSTRUCTION_RECEIVED)
        expect(nodeTwoEvents[0][2]).toEqual('trackerThree')
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
        await nodeOne.handleTrackerInstruction(unexpectedInstruction, 'trackerOne')
        expect(nodeOne.getStreams()).not.toContain('stream-2::0')
    })
})
