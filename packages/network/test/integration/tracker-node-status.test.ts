import { Tracker } from '../../src/logic/Tracker'
import { NetworkNode } from '../../src/NetworkNode'
import { wait, waitForEvent } from 'streamr-test-utils'

import { startNetworkNode, startTracker } from '../../src/composition'
import { Event as TrackerServerEvent } from '../../src/protocol/TrackerServer'
import { Event as NodeEvent } from '../../src/logic/Node'

/**
 * This test verifies that tracker receives status messages from nodes with list of inBound and outBound connections
 */
describe('check status message flow between tracker and two nodes tmp', () => {
    let tracker: Tracker
    let nodeOne: NetworkNode
    let nodeTwo: NetworkNode
    const TRACKER_ID = 'tracker'
    const streamId = 'stream-1'
    const streamId2 = 'stream-2'

    let nodeOneSessionId: string 
    let nodeTwoSessionId: string 

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
            id: TRACKER_ID
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

        // @ts-expect-error private method
        nodeOneSessionId = nodeOne.peerInfo.peerId
        // @ts-expect-error private method
        nodeTwoSessionId = nodeTwo.peerInfo.peerId

    })

    afterEach(async () => {
        await nodeOne.stop()
        await nodeTwo.stop()
        await tracker.stop()
    })

    it('tracker should receive status message from node', (done) => {
        // @ts-expect-error private field
        tracker.trackerServer.once(TrackerServerEvent.NODE_STATUS_RECEIVED, (statusMessage, peerInfo) => {
            expect(peerInfo).toEqual(nodeOneSessionId)
            // @ts-expect-error private field
            expect(statusMessage.status).toEqual(nodeOne.getFullStatus(TRACKER_ID))
            done()
        })

        nodeOne.start()
    })

    it('tracker should receive status from second node', (done) => {
        // @ts-expect-error private field
        tracker.trackerServer.once(TrackerServerEvent.NODE_STATUS_RECEIVED, (statusMessage, peerInfo) => {
            expect(peerInfo).toEqual(nodeTwoSessionId)
            // @ts-expect-error private field
            expect(statusMessage.status).toEqual(nodeTwo.getFullStatus(TRACKER_ID))
            done()
        })
        nodeTwo.start()
    })

    it('tracker should receive from both nodes new statuses', (done) => {
        nodeOne.start()
        nodeTwo.start()

        let receivedTotal = 0
        let nodeOneStatus: any = null
        let nodeTwoStatus: any = null

        // @ts-expect-error private field
        tracker.trackerServer.on(TrackerServerEvent.NODE_STATUS_RECEIVED, (statusMessage, nodeId) => {
            if (nodeId === nodeOneSessionId) {
                nodeOneStatus = statusMessage.status
                receivedTotal += 1
            }

            if (nodeId === nodeTwoSessionId) {
                nodeTwoStatus = statusMessage.status
                receivedTotal += 1
            }

            if (receivedTotal === 2) {
                // @ts-expect-error private field
                expect(nodeOneStatus).toEqual(nodeOne.getFullStatus())
                // @ts-expect-error private field
                expect(nodeTwoStatus).toEqual(nodeTwo.getFullStatus())
                done()
            }
        })

        setTimeout(() => {
            nodeOne.subscribe(streamId, 0)
            nodeTwo.subscribe(streamId, 0)
        }, 100)
    })

    it('tracker should receive rtt values from nodes', () => {
        return new Promise(async (resolve) => {
            let receivedTotal = 0
            let nodeOneStatus: any = null
            let nodeTwoStatus: any = null

            nodeOne.start()
            nodeTwo.start()

            nodeOne.subscribe(streamId, 0)
            nodeTwo.subscribe(streamId, 0)

            await Promise.all([
                waitForEvent(nodeOne, NodeEvent.NODE_SUBSCRIBED),
                waitForEvent(nodeTwo, NodeEvent.NODE_SUBSCRIBED),
                wait(2000)
            ])

            // @ts-expect-error private field
            tracker.trackerServer.on(TrackerServerEvent.NODE_STATUS_RECEIVED, (statusMessage, nodeId) => {
                if (nodeId === nodeOneSessionId) {
                    nodeOneStatus = statusMessage.status
                    receivedTotal += 1
                }

                if (nodeId === nodeTwoSessionId) {
                    nodeTwoStatus = statusMessage.status
                    receivedTotal += 1
                }

                if (receivedTotal === 2) {
                    expect(nodeOneStatus.rtts[nodeTwoSessionId]).toBeGreaterThanOrEqual(0)
                    expect(nodeTwoStatus.rtts[nodeOneSessionId]).toBeGreaterThanOrEqual(0)
                    resolve(true)
                }
            })
            nodeOne.subscribe(streamId2, 0)
            nodeTwo.subscribe(streamId2, 0)
        })
    })

    it('tracker should receive location information from nodes', (done) => {
        let receivedTotal = 0
        let nodeOneStatus: any = null
        let nodeTwoStatus: any = null

        nodeOne.start()
        nodeTwo.start()

        nodeOne.subscribe(streamId, 0)
        nodeTwo.subscribe(streamId, 0)

        // @ts-expect-error private field
        tracker.trackerServer.on(TrackerServerEvent.NODE_STATUS_RECEIVED, (statusMessage, nodeId) => {
            // @ts-expect-error private field
            if (nodeId === nodeOne.peerInfo.peerId) {
                nodeOneStatus = statusMessage.status
                // @ts-expect-error private field
                expect(tracker.locationManager.nodeLocations[nodeOneSessionId]).toBeUndefined()
            }

            // @ts-expect-error private field
            if (nodeId === nodeTwo.peerInfo.peerId) {
                nodeTwoStatus = statusMessage.status
                // @ts-expect-error private field
                expect(tracker.locationManager.nodeLocations[nodeTwoSessionId].country).toBe('FI')
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
