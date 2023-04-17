import { runAndWaitForEvents } from '@streamr/test-utils'
import { Tracker } from '@streamr/network-tracker'
import { NodeToTracker, Event as NodeToTrackerEvent } from '../../src/protocol/NodeToTracker'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { Status } from '../../src/identifiers'
import { createTestNodeClientWsEndpoint, startTestTracker } from '../utils'
import { waitForCondition } from '@streamr/utils'

describe('Tracker disconnects from node if node sends invalid status data', () => {
    let tracker: Tracker
    let nodeToTracker: NodeToTracker

    beforeEach(async () => {
        tracker = await startTestTracker({
            port: 30436
        })
        const peerInfo1 = PeerInfo.newNode('nodeToTracker1')
        const trackerPeerInfo = PeerInfo.newTracker(tracker.getTrackerId())
        const wsClient = createTestNodeClientWsEndpoint(peerInfo1)
        nodeToTracker = new NodeToTracker(wsClient)

        await runAndWaitForEvents([
            () => nodeToTracker.connectToTracker(tracker.getUrl(), trackerPeerInfo)
        ], [
            [nodeToTracker, NodeToTrackerEvent.CONNECTED_TO_TRACKER]
        ])
    })

    afterEach(async () => {
        await Promise.allSettled([
            tracker?.stop(),
            nodeToTracker?.stop()
        ])
    })

    it('Tracker disconnects from node if node sends invalid status data', async () => {
        const faultyStatus: Partial<Status> = {
            streamPart: {
                counter: 1,
                // @ts-expect-error string
                streamKey: 123,
                neighbors: []
            }
        }
        await runAndWaitForEvents([() => {
            nodeToTracker.sendStatus(tracker.getTrackerId(), faultyStatus as Status)
        }], [
            [nodeToTracker, NodeToTrackerEvent.TRACKER_DISCONNECTED],
        ])
        await waitForCondition(() => tracker.getNodes().length === 0, 4998)
        expect(tracker.getNodes().length).toEqual(0)
    })
})
