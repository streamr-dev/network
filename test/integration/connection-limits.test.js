const { startNetworkNode, startTracker } = require('../../src/composition')
const { callbackToPromise } = require('../../src/util')
const { wait, LOCALHOST, DEFAULT_TIMEOUT } = require('../util')
const endpointEvents = require('../../src/connection/Endpoint').events
const { disconnectionReasons } = require('../../src/messages/messageTypes')
const TrackerNode = require('../../src/protocol/TrackerNode')

jest.setTimeout(DEFAULT_TIMEOUT)

/**
 * This test verifies that limits for connections work
 */
describe('check maxInBound and maxOutBound limits', () => {
    let tracker
    let contactNode
    let otherNodes
    const streamId = 'stream-id'

    it('should be able to subscribe, increase connection limits and stop successfully', async (done) => {
        tracker = await startTracker(LOCALHOST, 30550, 'tracker')
        contactNode = await startNetworkNode(LOCALHOST, 30551, 'node-0')
        await contactNode.addBootstrapTracker(tracker.getAddress())

        otherNodes = await Promise.all([
            startNetworkNode(LOCALHOST, 30552, 'node-1'),
            startNetworkNode(LOCALHOST, 30553, 'node-2'),
            startNetworkNode(LOCALHOST, 30554, 'node-3'),
            startNetworkNode(LOCALHOST, 30555, 'node-4'),
            startNetworkNode(LOCALHOST, 30556, 'node-5'),
            startNetworkNode(LOCALHOST, 30557, 'node-6'),
            startNetworkNode(LOCALHOST, 30558, 'node-7'),
            startNetworkNode(LOCALHOST, 30559, 'node-8'),
            startNetworkNode(LOCALHOST, 30560, 'node-9')
        ])
        await Promise.all(otherNodes.map((node) => node.addBootstrapTracker(tracker.getAddress())))

        // Become subscribers (one-by-one, for well connected graph)
        otherNodes[0].subscribe(streamId, 0)
        otherNodes[1].subscribe(streamId, 0)
        otherNodes[2].subscribe(streamId, 0)
        otherNodes[3].subscribe(streamId, 0)
        otherNodes[4].subscribe(streamId, 0)
        otherNodes[5].subscribe(streamId, 0)
        otherNodes[6].subscribe(streamId, 0)

        otherNodes[7].protocols.nodeToNode.endpoint.once(endpointEvents.PEER_DISCONNECTED, ({ address, reason }) => {
            expect(reason).toEqual(disconnectionReasons.MAX_OUTBOUND_CONNECTIONS)

            // update limits and connect again
            otherNodes.forEach((node) => {
                const limits = node.getConnectionLimitsPerStream()
                node.setConnectionLimitsPerStream(limits.maxInBound + 2, limits.maxOutBound + 2)
            })

            otherNodes[7].protocols.trackerNode.once(TrackerNode.events.STREAM_INFO_RECEIVED, async () => {
                done()
            })

            // eslint-disable-next-line no-underscore-dangle
            otherNodes[7]._maintainStreams()
        })

        otherNodes[7].subscribe(streamId, 0)
    })

    afterAll(async () => {
        await callbackToPromise(contactNode.stop.bind(contactNode))
        await wait(1000)
        await Promise.all(otherNodes.map((node) => callbackToPromise(node.stop.bind(node))))
        await callbackToPromise(tracker.stop.bind(tracker))
    })
})
