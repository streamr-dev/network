import { runAndWaitForEvents } from "streamr-test-utils"
import { Tracker} from "../../src/logic/tracker/Tracker"
import { NodeToTracker, Event as NodeToTrackerEvent } from "../../src/protocol/NodeToTracker"
import { PeerInfo } from "../../src/connection/PeerInfo"
import NodeClientWsEndpoint from "../../src/connection/ws/NodeClientWsEndpoint"
import { startTracker } from "../../src/composition"
import { Status } from "../../src/identifiers"

describe('Tracker disconnects from node if node sends invalid status data', () => {
    let tracker: Tracker
    let nodeToTracker: NodeToTracker
    const TRACKER_ID = 'tracker'

    beforeEach(async () => {
        tracker = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 30436
            },
            id: 'tracker'
        })
        const peerInfo1 = PeerInfo.newNode('nodeToTracker1')
        const trackerPeerInfo = PeerInfo.newTracker(TRACKER_ID)
        const wsClient = new NodeClientWsEndpoint(peerInfo1)
        nodeToTracker = new NodeToTracker(wsClient)

        await runAndWaitForEvents([
            () => nodeToTracker.connectToTracker(tracker.getUrl(), trackerPeerInfo)
        ], [
            [nodeToTracker, NodeToTrackerEvent.CONNECTED_TO_TRACKER]
        ])
    })
    beforeEach(async () => {
        await tracker.stop()
        await nodeToTracker.stop()
    })

    it('Tracker disconnects from node if node sends invalid status data', async () => {
        const faultyStatus: Partial<Status> = {
            stream: {
                counter: 1,
                // @ts-expect-error string
                streamKey: 123,
                neighbors: []
            }
        }
        await runAndWaitForEvents([() => {
            nodeToTracker.sendStatus('tracker', faultyStatus as Status)
        }], [
            [nodeToTracker, 'streamr:tracker-node:tracker-disconnected']
        ])
        expect(tracker.getNodes().length).toEqual(0)
    })
})