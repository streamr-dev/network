import { Status } from '../../src/identifiers'
import { runAndWaitForEvents, wait } from 'streamr-test-utils'

import { PeerInfo } from '../../src/connection/PeerInfo'
import { startTracker, Tracker } from '../../src/composition'
import { NodeToTracker, Event as NodeToTrackerEvent } from '../../src/protocol/NodeToTracker'
import { Event as TrackerServerEvent } from '../../src/protocol/TrackerServer'
import { getTopology } from '../../src/logic/tracker/trackerSummaryUtils'
import NodeClientWsEndpoint from '../../src/connection/ws/NodeClientWsEndpoint'
import { NodeId } from '../../src/logic/node/Node'

const WAIT_TIME = 2000

const formStatus = (counter1: number, nodes1: NodeId[]): Partial<Status> => ({
    stream: {
        id: 'stream-1',
        partition: 0,
        neighbors: nodes1,
        counter: counter1
    }
})

describe('tracker: instruction counter filtering', () => {
    let tracker: Tracker
    let nodeToTracker1: NodeToTracker
    let nodeToTracker2: NodeToTracker

    beforeEach(async () => {
        tracker = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 30420
            },
            id: 'tracker'
        })
        const peerInfo1 = PeerInfo.newNode('nodeToTracker1')
        const peerInfo2 = PeerInfo.newNode('nodeToTracker2')
        const trackerPeerInfo = PeerInfo.newTracker('tracker')
        const wsClient1 = new NodeClientWsEndpoint(peerInfo1)
        const wsClient2 = new NodeClientWsEndpoint(peerInfo2)
        nodeToTracker1 = new NodeToTracker(wsClient1)
        nodeToTracker2 = new NodeToTracker(wsClient2)

        await runAndWaitForEvents([
            () => { nodeToTracker1.connectToTracker(tracker.getUrl(), trackerPeerInfo) },
            () => { nodeToTracker2.connectToTracker(tracker.getUrl(), trackerPeerInfo) }
        ], [
            [nodeToTracker1, NodeToTrackerEvent.CONNECTED_TO_TRACKER],
            [nodeToTracker2, NodeToTrackerEvent.CONNECTED_TO_TRACKER]
        ])

        await runAndWaitForEvents([
            () => { nodeToTracker1.sendStatus('tracker', formStatus(0, []) as Status) },
            () => { nodeToTracker2.sendStatus('tracker', formStatus(0, []) as Status) }
        ], [
            [nodeToTracker1, NodeToTrackerEvent.TRACKER_INSTRUCTION_RECEIVED],
            [nodeToTracker2, NodeToTrackerEvent.TRACKER_INSTRUCTION_RECEIVED]
        ])
    })

    afterEach(async () => {
        await nodeToTracker1.stop()
        await nodeToTracker2.stop()
        await tracker.stop()
    })

    it('handles status messages with counters equal or more to current counter(s)', async () => {
        await runAndWaitForEvents(
            () => {
                nodeToTracker1.sendStatus('tracker', formStatus(1, []) as Status)
                    .catch(() => {})
            },
            [nodeToTracker1, NodeToTrackerEvent.TRACKER_INSTRUCTION_RECEIVED],
            WAIT_TIME
        )
    })

    it('ignores status messages with counters less than current counter(s)', async () => {
        let numOfInstructions = 0
        nodeToTracker1.on(NodeToTrackerEvent.TRACKER_INSTRUCTION_RECEIVED, () => {
            numOfInstructions += 1
        })
        nodeToTracker1.sendStatus('tracker', formStatus(0, []) as Status)
            .catch(() => {})
        await wait(WAIT_TIME)
        expect(numOfInstructions).toEqual(0)
    })

    it('partly handles status messages with mixed counters compared to current counters', async () => {
        let numOfInstructions = 0
        nodeToTracker1.on(NodeToTrackerEvent.TRACKER_INSTRUCTION_RECEIVED, () => {
            numOfInstructions += 1
        })
        nodeToTracker1.sendStatus('tracker', formStatus(1, []) as Status)
            .catch(() => {})
        await wait(WAIT_TIME)
        expect(numOfInstructions).toEqual(1)
    })

    it('NET-36: tracker receiving status with old counter should not affect topology', async () => {
        const topologyBefore = getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())
        await runAndWaitForEvents(
            () => { nodeToTracker1.sendStatus('tracker', formStatus(0, []) as Status) },
            // @ts-expect-error trackerServer is private
            [tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED]
        )
        expect(getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())).toEqual(topologyBefore)
    })

    it('NET-36: tracker receiving status with partial old counter should not affect topology', async () => {
        const topologyBefore = getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())
        await runAndWaitForEvents(
            () => {
                nodeToTracker1.sendStatus('tracker', formStatus(1, []) as Status)
            },
            // @ts-expect-error trackerServer is private
            [tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED]
        )
        expect(getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())).toEqual(topologyBefore)
    })
})
