import { Tracker } from '../../src/logic/Tracker'
import { waitForEvent } from 'streamr-test-utils'

import { PeerInfo } from '../../src/connection/PeerInfo'
import { startEndpoint } from '../../src/connection/WsEndpoint'
import { TrackerNode, Event as TrackerNodeEvent } from '../../src/protocol/TrackerNode'
import { startTracker } from '../../src/composition'
import { StreamIdAndPartition } from '../../src/identifiers'

/**
 * Ensure that when a storage node requests storage nodes from tracker, the list does not contain the
 * requesting storage node itself.
 */
describe('storage nodes response from tracker does not contain self', () => {
    let tracker: Tracker
    let storageNodeOne: TrackerNode
    let storageNodeTwo: TrackerNode
    let storageNodeThree: TrackerNode

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 30460,
            id: 'tracker'
        })

        const ep1 = await startEndpoint('127.0.0.1', 30461, PeerInfo.newStorage('storageNodeOne'), null)
        const ep2 = await startEndpoint('127.0.0.1', 30462, PeerInfo.newStorage('storageNodeTwo'), null)
        const ep3 = await startEndpoint('127.0.0.1', 30463, PeerInfo.newStorage('storageNodeThree'), null)

        storageNodeOne = new TrackerNode(ep1)
        storageNodeTwo = new TrackerNode(ep2)
        storageNodeThree = new TrackerNode(ep3)

        await storageNodeOne.connectToTracker(tracker.getAddress())
        await storageNodeTwo.connectToTracker(tracker.getAddress())
        await storageNodeThree.connectToTracker(tracker.getAddress())
    })

    afterEach(async () => {
        await Promise.all([
            storageNodeOne.stop(),
            storageNodeTwo.stop(),
            storageNodeThree.stop(),
            tracker.stop()
        ])
    })

    it('storage node response does not contain self', async () => {
        await storageNodeOne.sendStorageNodesRequest('tracker', new StreamIdAndPartition('stream', 0))
        const [msg]: any = await waitForEvent(storageNodeOne, TrackerNodeEvent.STORAGE_NODES_RESPONSE_RECEIVED)
        expect(msg.nodeIds).toEqual(['storageNodeTwo', 'storageNodeThree'])
    })
})
