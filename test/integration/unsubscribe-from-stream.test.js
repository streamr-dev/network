const { wait, waitForEvent } = require('streamr-test-utils')

const { startNetworkNode, startTracker } = require('../../src/composition')
const Node = require('../../src/logic/Node')
const { LOCALHOST } = require('../util')
const { StreamIdAndPartition } = require('../../src/identifiers')

describe('node unsubscribing from a stream', () => {
    let tracker
    let nodeA
    let nodeB
    const s1 = new StreamIdAndPartition('s', 1)
    const s2 = new StreamIdAndPartition('s', 2)

    beforeEach(async () => {
        tracker = await startTracker(LOCALHOST, 30450, 'tracker')
        nodeA = await startNetworkNode(LOCALHOST, 30451, 'a')
        nodeB = await startNetworkNode(LOCALHOST, 30452, 'b')

        nodeA.addBootstrapTracker(tracker.getAddress())
        nodeB.addBootstrapTracker(tracker.getAddress())

        nodeA.subscribeToStreamIfHaveNotYet(s1)
        nodeB.subscribeToStreamIfHaveNotYet(s1)
        nodeA.subscribeToStreamIfHaveNotYet(s2)
        nodeB.subscribeToStreamIfHaveNotYet(s2)

        await waitForEvent(nodeB, Node.events.NODE_SUBSCRIBED)
        await waitForEvent(nodeA, Node.events.NODE_SUBSCRIBED)
    })

    afterEach(async () => {
        await nodeA.stop()
        await nodeB.stop()
        await tracker.stop()
    })

    test('node still receives data for subscribed streams thru existing connections', async () => {
        const actual = []
        nodeB.addMessageListener((streamMessage) => {
            actual.push(`${streamMessage.getStreamId()}::${streamMessage.getStreamPartition()}`)
        })

        nodeB.unsubscribeFromStream(s2)
        await waitForEvent(nodeA, Node.events.NODE_UNSUBSCRIBED)

        nodeA.publish('s', 2, 0, 0, '', '', null, null, {}, '', 0) // s::2
        nodeA.publish('s', 1, 0, 0, '', '', null, null, {}, '', 0) // s::1

        await wait(150)

        expect(actual).toEqual(['s::1'])
    })

    test('connection between nodes is not kept if no shared streams', async () => {
        nodeB.unsubscribeFromStream(s2)
        await waitForEvent(nodeA, Node.events.NODE_UNSUBSCRIBED)

        nodeA.unsubscribeFromStream(s1)
        await waitForEvent(nodeB, Node.events.NODE_UNSUBSCRIBED)

        const [aEventArgs, bEventArgs] = await Promise.all([
            waitForEvent(nodeA, Node.events.NODE_DISCONNECTED),
            waitForEvent(nodeB, Node.events.NODE_DISCONNECTED)
        ])

        expect(aEventArgs).toEqual(['b'])
        expect(bEventArgs).toEqual(['a'])
    })
})
