const { wait, waitForEvent } = require('streamr-test-utils')

const { startNetworkNode, startTracker } = require('../../src/composition')
const { Event: TrackerServerEvent } = require('../../src/protocol/TrackerServer')
const { Event: NodeEvent } = require('../../src/logic/Node')

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
            host: '127.0.0.1',
            port: 30750,
            id: 'tracker'
        })
        nodeOne = await startNetworkNode({
            host: '127.0.0.1',
            port: 30751,
            id: 'node-1',
            trackers: [tracker.getAddress()],
            pingInterval: 100
        })
        nodeTwo = await startNetworkNode({
            host: '127.0.0.1',
            port: 30752,
            id: 'node-2',
            trackers: [tracker.getAddress()],
            location,
            pingInterval: 100
        })
    })

    afterEach(async () => {
        await nodeOne.stop()
        await nodeTwo.stop()
        await tracker.stop()
    })

    it('tracker should receive status message from node', async (done) => {
        tracker.trackerServer.once(TrackerServerEvent.NODE_STATUS_RECEIVED, (statusMessage, peerInfo) => {
            expect(peerInfo).toEqual('node-1')
            // eslint-disable-next-line no-underscore-dangle
            expect(statusMessage.status).toEqual(nodeOne.getStatus())
            done()
        })

        nodeOne.start()
    })

    it('tracker should receive status from second node', async (done) => {
        tracker.trackerServer.once(TrackerServerEvent.NODE_STATUS_RECEIVED, (statusMessage, peerInfo) => {
            expect(peerInfo).toEqual('node-2')
            // eslint-disable-next-line no-underscore-dangle
            expect(statusMessage.status).toEqual(nodeTwo.getStatus())
            done()
        })
        nodeTwo.start()
    })

    it('tracker should receive from both nodes new statuses', async (done) => {
        nodeOne.start()
        nodeTwo.start()

        let receivedTotal = 0
        let nodeOneStatus = null
        let nodeTwoStatus = null

        tracker.trackerServer.on(TrackerServerEvent.NODE_STATUS_RECEIVED, (statusMessage, nodeId) => {
            if (nodeId === 'node-1') {
                nodeOneStatus = statusMessage.status
                receivedTotal += 1
            }

            if (nodeId === 'node-2') {
                nodeTwoStatus = statusMessage.status
                receivedTotal += 1
            }

            if (receivedTotal === 2) {
                expect(nodeOneStatus).toEqual(nodeOne.getStatus())
                expect(nodeTwoStatus).toEqual(nodeTwo.getStatus())
                done()
            }
        })

        await wait(100)
        nodeOne.subscribe(streamId, 0)
        nodeTwo.subscribe(streamId, 0)
    })

    it('tracker should receive rtt values from nodes', async (done) => {
        let receivedTotal = 0
        let nodeOneStatus = null
        let nodeTwoStatus = null

        nodeOne.start()
        nodeTwo.start()

        nodeOne.subscribe(streamId, 0)
        nodeTwo.subscribe(streamId, 0)

        await Promise.all([
            waitForEvent(nodeOne, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(nodeTwo, NodeEvent.NODE_SUBSCRIBED),
            wait(2000)
        ])

        tracker.trackerServer.on(TrackerServerEvent.NODE_STATUS_RECEIVED, (statusMessage, nodeId) => {
            if (nodeId === 'node-1') {
                nodeOneStatus = statusMessage.status
                receivedTotal += 1
            }

            if (nodeId === 'node-2') {
                nodeTwoStatus = statusMessage.status
                receivedTotal += 1
            }

            if (receivedTotal === 2) {
                expect(nodeOneStatus.rtts['node-2']).toBeGreaterThanOrEqual(0)
                expect(nodeTwoStatus.rtts['node-1']).toBeGreaterThanOrEqual(0)
                done()
            }
        })
        nodeOne.subscribe(streamId2, 0)
        nodeTwo.subscribe(streamId2, 0)
    })

    it('tracker should receive location information from nodes', async (done) => {
        let receivedTotal = 0
        let nodeOneStatus = null
        let nodeTwoStatus = null

        nodeOne.start()
        nodeTwo.start()

        nodeOne.subscribe(streamId, 0)
        nodeTwo.subscribe(streamId, 0)

        tracker.trackerServer.on(TrackerServerEvent.NODE_STATUS_RECEIVED, (statusMessage, nodeId) => {
            if (nodeId === nodeOne.peerInfo.peerId) {
                nodeOneStatus = statusMessage.status
                expect(tracker.locationManager.nodeLocations['node-1']).toBeUndefined()
            }

            if (nodeId === nodeTwo.peerInfo.peerId) {
                nodeTwoStatus = statusMessage.status
                expect(tracker.locationManager.nodeLocations['node-2'].country).toBe('FI')
            }
            receivedTotal += 1
            if (receivedTotal === 2) {
                expect(Object.keys(nodeOneStatus.location).length).toEqual(4)
                expect(Object.keys(nodeTwoStatus.location).length).toEqual(4)
                done()
            }
        })
    })
})
