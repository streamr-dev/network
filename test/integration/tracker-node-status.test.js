const { wait } = require('streamr-test-utils')

const { startNetworkNode, startTracker } = require('../../src/composition')
const { LOCALHOST } = require('../util')
const TrackerServer = require('../../src/protocol/TrackerServer')

/**
 * This test verifies that tracker receives status messages from nodes with list of inBound and outBound connections
 */
describe('check status message flow between tracker and two nodes', () => {
    let tracker
    let nodeOne
    let nodeTwo
    const streamId = 'stream-1'
    const streamId2 = 'stream-2'

    const location = {
        country: 'FI',
        city: 'Helsinki',
        latitude: null,
        longitude: null
    }

    beforeEach(async () => {
        tracker = await startTracker({
            host: LOCALHOST, port: 30750, id: 'tracker'
        })
        nodeOne = await startNetworkNode(LOCALHOST, 30752, 'node-1', [], null, 'node-1', null, 100)
        nodeTwo = await startNetworkNode(LOCALHOST, 30753, 'node-2', [], null, 'node-2', location, 100)
    })

    afterEach(async () => {
        await nodeOne.stop()
        await nodeTwo.stop()
        await tracker.stop()
    })

    it('tracker should receive status message from node', async (done) => {
        tracker.protocols.trackerServer.once(TrackerServer.events.NODE_STATUS_RECEIVED, (statusMessage, peerInfo) => {
            expect(peerInfo).toEqual('node-1')
            // eslint-disable-next-line no-underscore-dangle
            expect(statusMessage.status).toEqual(nodeOne._getStatus())
            done()
        })

        nodeOne.addBootstrapTracker(tracker.getAddress())
    })

    it('tracker should receive status from second node', async (done) => {
        tracker.protocols.trackerServer.once(TrackerServer.events.NODE_STATUS_RECEIVED, (statusMessage, peerInfo) => {
            expect(peerInfo).toEqual('node-2')
            // eslint-disable-next-line no-underscore-dangle
            expect(statusMessage.status).toEqual(nodeTwo._getStatus())
            done()
        })
        nodeTwo.addBootstrapTracker(tracker.getAddress())
    })

    it('tracker should receive from both nodes new statuses', async (done) => {
        nodeOne.addBootstrapTracker(tracker.getAddress())
        nodeTwo.addBootstrapTracker(tracker.getAddress())

        let receivedTotal = 0
        tracker.protocols.trackerServer.on(TrackerServer.events.NODE_STATUS_RECEIVED, (statusMessage, nodeId) => {
            if (nodeId === 'node-1') {
                // eslint-disable-next-line no-underscore-dangle
                expect(statusMessage.status).toEqual(nodeOne._getStatus())
                receivedTotal += 1
            }

            if (nodeId === 'node-2') {
                // eslint-disable-next-line no-underscore-dangle
                expect(statusMessage.status).toEqual(nodeTwo._getStatus())
                receivedTotal += 1
            }

            if (receivedTotal === 2) {
                done()
            }
        })

        nodeOne.subscribe(streamId, 0)
        nodeTwo.subscribe(streamId, 0)
    })

    it('tracker should receive rtt values from nodes', async (done) => {
        let receivedTotal = 0

        nodeOne.addBootstrapTracker(tracker.getAddress())
        nodeTwo.addBootstrapTracker(tracker.getAddress())

        nodeOne.subscribe(streamId, 0)
        nodeTwo.subscribe(streamId, 0)
        await wait(100)

        tracker.protocols.trackerServer.on(TrackerServer.events.NODE_STATUS_RECEIVED, (statusMessage, nodeId) => {
            if (nodeId === 'node-1') {
                // eslint-disable-next-line no-underscore-dangle
                expect(statusMessage.status.rtts['node-2']).toBeGreaterThanOrEqual(0)
                receivedTotal += 1
            }

            if (nodeId === 'node-2') {
                // eslint-disable-next-line no-underscore-dangle
                expect(statusMessage.status.rtts['node-1']).toBeGreaterThanOrEqual(0)
                receivedTotal += 1
            }

            if (receivedTotal === 2) {
                done()
            }
        })
        nodeOne.subscribe(streamId2, 0)
        nodeTwo.subscribe(streamId2, 0)
    })

    it('tracker should receive location information from nodes', async (done) => {
        let receivedTotal = 0

        nodeOne.addBootstrapTracker(tracker.getAddress())
        nodeTwo.addBootstrapTracker(tracker.getAddress())

        nodeOne.subscribe(streamId, 0)
        nodeTwo.subscribe(streamId, 0)

        tracker.protocols.trackerServer.on(TrackerServer.events.NODE_STATUS_RECEIVED, (statusMessage, nodeId) => {
            if (nodeId === nodeOne.opts.id) {
                // eslint-disable-next-line no-underscore-dangle
                expect(Object.keys(statusMessage.getStatus().location).length).toEqual(4)
                expect(tracker.nodeLocations['node-1']).toBeNull()
            }

            if (nodeId === nodeTwo.opts.id) {
                // eslint-disable-next-line no-underscore-dangle
                expect(Object.keys(statusMessage.getStatus().location).length).toEqual(4)
                expect(tracker.nodeLocations['node-2'].country).toBe('FI')
            }
            receivedTotal += 1
            if (receivedTotal === 2) {
                done()
            }
        })
    })
})
