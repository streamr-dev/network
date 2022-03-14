import { Tracker } from '../../src/logic/tracker/Tracker'
import { NetworkNode } from '../../src/logic/node/NetworkNode'

import { createNetworkNode, Logger, startTracker } from '../../src/composition'
import { StreamPartIDUtils} from 'streamr-client-protocol'
import { waitForCondition } from 'streamr-test-utils'

const SP_A = StreamPartIDUtils.parse('SP_A#0')
const SP_B = StreamPartIDUtils.parse('SP_B#0')

const TEST_TIMEOUT = 15 * 1000

const logger = new Logger(module)

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

    it('starts and stops', async () => {
        for (const streamPart of [SP_A, SP_B]) {
            await nodeOne.subscribeAndWaitForJoin(streamPart)
            await nodeTwo.subscribeAndWaitForJoin(streamPart)
        }

        // Cause some churn to increase counters to go above one
        // (InstructionThrottler handles 1st counter in a special way)
        nodeTwo.unsubscribe(SP_A)
        await waitForCondition(() => nodeOne.getNeighborsForStreamPart(SP_A).length === 0)
        await nodeTwo.subscribeAndWaitForJoin(SP_A)

        nodeOne.unsubscribe(SP_B) // Note: this shouldn't affect counter of (nodeOne, SP_A) in any way!
        await waitForCondition(() => nodeTwo.getNeighborsForStreamPart(SP_B).length === 0)

        await nodeThree.subscribeAndWaitForJoin(SP_A)
        logger.info("EKA KOHTA")

        expect(nodeThree.getNeighborsForStreamPart(SP_A)).toIncludeSameMembers(['nodeOne', 'nodeTwo'])
        expect(nodeOne.getNeighborsForStreamPart(SP_A)).toIncludeSameMembers(['nodeTwo', 'nodeThree'])

        logger.info("TOKA KOHTA")
    }, TEST_TIMEOUT)
})
