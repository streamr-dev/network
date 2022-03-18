import { Tracker, startTracker } from 'streamr-network-tracker'
import { NetworkNode } from '../../src/logic/NetworkNode'

import { createNetworkNode } from '../../src/composition'
import { StreamPartIDUtils } from 'streamr-client-protocol'
import { waitForCondition } from 'streamr-test-utils'

const STREAM_PART_A = StreamPartIDUtils.parse('STREAM_PART_A#0')
const STREAM_PART_B = StreamPartIDUtils.parse('STREAM_PART_B#0')

const TEST_TIMEOUT = 15 * 1000

/**
 * An integration test made in response to an observed bug: an unsubscribing node
 * would have all its tracker's counters reset even though only one counter should
 * be reset (the one corresponding to the stream part being unsubscribed from).
 */
describe('tracker counters are stream part specific', () => {
    let tracker: Tracker
    let nodeOne: NetworkNode
    let nodeTwo: NetworkNode
    let nodeThree: NetworkNode

    beforeEach(async () => {
        tracker = await startTracker({
            id: 'tracker',
            listen: {
                hostname: '127.0.0.1',
                port: 32401
            }
        })
        nodeOne = createNetworkNode({
            id: 'nodeOne',
            trackers: [tracker.getConfigRecord()],
            webrtcDisallowPrivateAddresses: false
        })
        nodeTwo = createNetworkNode({
            id: 'nodeTwo',
            trackers: [tracker.getConfigRecord()],
            webrtcDisallowPrivateAddresses: false
        })
        nodeThree = createNetworkNode({
            id: 'nodeThree',
            trackers: [tracker.getConfigRecord()],
            webrtcDisallowPrivateAddresses: false
        })
        nodeOne.start()
        nodeTwo.start()
        nodeThree.start()
    }, TEST_TIMEOUT)

    afterEach(async () => {
        await Promise.allSettled([
            tracker?.stop(),
            nodeOne?.stop(),
            nodeTwo?.stop(),
            nodeThree?.stop()
        ])
    })

    it('NET-745', async () => {
        for (const streamPart of [STREAM_PART_A, STREAM_PART_B]) {
            await nodeOne.subscribeAndWaitForJoin(streamPart)
            await nodeTwo.subscribeAndWaitForJoin(streamPart)
        }

        // Cause some churn to increase counter values (the goal being counter of (nodeOne, STREAM_PART_A) > 1)
        nodeTwo.unsubscribe(STREAM_PART_A)
        await waitForCondition(() => nodeOne.getNeighborsForStreamPart(STREAM_PART_A).length === 0)
        await nodeTwo.subscribeAndWaitForJoin(STREAM_PART_A)

        nodeOne.unsubscribe(STREAM_PART_B) // Bug NET-745 used to happen here
        await waitForCondition(() => nodeTwo.getNeighborsForStreamPart(STREAM_PART_B).length === 0)

        await nodeThree.subscribeAndWaitForJoin(STREAM_PART_A)
        await waitForCondition(() => nodeOne.getNeighborsForStreamPart(STREAM_PART_A).length >= 2)

        expect(nodeOne.getNeighborsForStreamPart(STREAM_PART_A)).toIncludeSameMembers(['nodeTwo', 'nodeThree'])
        expect(nodeThree.getNeighborsForStreamPart(STREAM_PART_A)).toIncludeSameMembers(['nodeOne', 'nodeTwo'])
    }, TEST_TIMEOUT)
})
