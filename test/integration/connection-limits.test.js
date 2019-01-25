const { startNetworkNode, startTracker } = require('../../src/composition')
const { callbackToPromise } = require('../../src/util')
const { LOCALHOST, DEFAULT_TIMEOUT } = require('../util')
const endpointEvents = require('../../src/connection/Endpoint').events
const { disconnectionReasons } = require('../../src/messages/messageTypes')

jest.setTimeout(DEFAULT_TIMEOUT)

/**
 * This test verifies that on receiving a duplicate message, it is not re-emitted to the node's subscribers.
 */
describe('duplicate message detection and avoidance', () => {
    let tracker
    let contactNode
    let otherNodes

    it('should be able to start and stop successfully', async (done) => {
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
        otherNodes[0].subscribe('stream-id', 0)
        otherNodes[1].subscribe('stream-id', 0)
        otherNodes[2].subscribe('stream-id', 0)
        otherNodes[3].subscribe('stream-id', 0)
        otherNodes[4].subscribe('stream-id', 0)
        otherNodes[5].subscribe('stream-id', 0)
        otherNodes[6].subscribe('stream-id', 0)

        otherNodes[7].protocols.nodeToNode.endpoint.once(endpointEvents.PEER_DISCONNECTED, ({ address, reason }) => {
            expect(reason).toEqual(disconnectionReasons.MAX_OUTBOUND_CONNECTIONS)
            done()
        })

        otherNodes[7].subscribe('stream-id', 0)
    })

    afterAll(async () => {
        await callbackToPromise(contactNode.stop.bind(contactNode))
        await Promise.all(otherNodes.map((node) => callbackToPromise(node.stop.bind(node))))
        await callbackToPromise(tracker.stop.bind(tracker))
    })
})
