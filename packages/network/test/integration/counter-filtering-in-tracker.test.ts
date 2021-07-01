import { Status } from '../../src/identifiers'
import { wait, waitForEvent } from 'streamr-test-utils'

import { PeerInfo } from '../../src/connection/PeerInfo'
import { startTracker, Tracker } from '../../src/composition'
import { TrackerNode, Event as TrackerNodeEvent } from '../../src/protocol/TrackerNode'
import { Event as TrackerServerEvent } from '../../src/protocol/TrackerServer'
import { getTopology } from '../../src/logic/trackerSummaryUtils'
import { ClientWsEndpoint } from '../../src/connection/ClientWsEndpoint'

const WAIT_TIME = 200

const formStatus = (counter1: number, counter2: number, nodes1: string[], nodes2: string[], singleStream: boolean): Partial<Status> => ({
    streams: {
        'stream-1::0': {
            inboundNodes: nodes1,
            outboundNodes: nodes1,
            counter: counter1,
        },
        'stream-2::0': {
            inboundNodes: nodes2,
            outboundNodes: nodes2,
            counter: counter2
        }
    },
    singleStream
})

describe('tracker: counter filtering', () => {
    let tracker: Tracker
    let trackerNode1: TrackerNode
    let trackerNode2: TrackerNode

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 30420,
            id: 'tracker'
        })
        const peerInfo1 = PeerInfo.newNode('trackerNode1')
        const peerInfo2 = PeerInfo.newNode('trackerNode2')
        const wsClient1 = new ClientWsEndpoint(peerInfo1)
        trackerNode1 = new TrackerNode(wsClient1)

        const wsClient2 = new ClientWsEndpoint(peerInfo2)

        trackerNode2 = new TrackerNode(wsClient2)
        trackerNode1.connectToTracker(tracker.getUrl())
        trackerNode2.connectToTracker(tracker.getUrl())

        await Promise.all([
            waitForEvent(trackerNode1, TrackerNodeEvent.CONNECTED_TO_TRACKER),
            waitForEvent(trackerNode2, TrackerNodeEvent.CONNECTED_TO_TRACKER)
        ])

        trackerNode1.sendStatus('tracker', formStatus(0, 0, [], [], false) as Status)
        trackerNode2.sendStatus('tracker', formStatus(0, 0, [], [], false) as Status)

        await waitForEvent(trackerNode1, TrackerNodeEvent.TRACKER_INSTRUCTION_RECEIVED)
        await waitForEvent(trackerNode1, TrackerNodeEvent.TRACKER_INSTRUCTION_RECEIVED)
    })

    afterEach(async () => {
        await trackerNode1.stop()
        await trackerNode2.stop()
        await tracker.stop()
    })

    test('handles status messages with counters equal or more to current counter(s)', async () => {
        trackerNode1.sendStatus('tracker', formStatus(1, 666, [], [], false) as Status)

        let numOfInstructions = 0
        trackerNode1.on(TrackerNodeEvent.TRACKER_INSTRUCTION_RECEIVED, () => {
            numOfInstructions += 1
        })

        await wait(WAIT_TIME)
        expect(numOfInstructions).toEqual(2)
    })

    test('ignores status messages with counters less than current counter(s)', async () => {
        trackerNode1.sendStatus('tracker', formStatus(0, 0, [], [], false) as Status)

        let numOfInstructions = 0
        trackerNode1.on(TrackerNodeEvent.TRACKER_INSTRUCTION_RECEIVED, () => {
            numOfInstructions += 1
        })

        await wait(WAIT_TIME)
        expect(numOfInstructions).toEqual(0)
    })

    test('partly handles status messages with mixed counters compared to current counters', async () => {
        trackerNode1.sendStatus('tracker', formStatus(1, 0, [], [], false) as Status)

        let numOfInstructions = 0
        trackerNode1.on(TrackerNodeEvent.TRACKER_INSTRUCTION_RECEIVED, () => {
            numOfInstructions += 1
        })

        await wait(WAIT_TIME)
        expect(numOfInstructions).toEqual(1)
    })

    test('NET-36: tracker receiving status with old counter should not affect topology', async () => {
        const topologyBefore = getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())
        trackerNode1.sendStatus('tracker', formStatus(0, 0, [], [], false) as Status)
        // @ts-expect-error trackerServer is private
        await waitForEvent(tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED)
        expect(getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())).toEqual(topologyBefore)
    })

    test('NET-36: tracker receiving status with partial old counter should not affect topology', async () => {
        const topologyBefore = getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())
        trackerNode1.sendStatus('tracker', formStatus(1, 0, [], [], false) as Status)
        // @ts-expect-error trackerServer is private
        await waitForEvent(tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED)
        expect(getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())).toEqual(topologyBefore)
    })
})
