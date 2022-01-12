import { Tracker } from '../../src/logic/tracker/Tracker'
import { NetworkNode } from '../../src/logic/node/NetworkNode'
import { wait, runAndWaitForEvents } from 'streamr-test-utils'

import { createNetworkNode, startTracker } from '../../src/composition'
import { Event as TrackerServerEvent } from '../../src/protocol/TrackerServer'
import { Event as NodeEvent } from '../../src/logic/node/Node'
import { SPID } from 'streamr-client-protocol'

/**
 * This test verifies that tracker receives status messages from nodes with list of neighbor connections
 */

// Seems to only be able to perform one connection on the tracker using the split ws client/server (???)
describe('check status message flow between tracker and two nodes', () => {
    let tracker: Tracker
    let nodeOne: NetworkNode
    let nodeTwo: NetworkNode
    const streamId = 'stream-1'
    const streamId2 = 'stream-2'

    const location = {
        country: 'FI',
        city: 'Helsinki'
    }

    beforeEach(async () => {
        tracker = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 30750
            }
        })
        const trackerInfo = tracker.getConfigRecord()

        nodeOne = createNetworkNode({
            id: 'node-1',
            trackers: [trackerInfo],
            peerPingInterval: 100,
            trackerPingInterval: 100,
            rttUpdateTimeout: 10
        })

        nodeTwo = createNetworkNode({
            id: 'node-2',
            trackers: [trackerInfo],
            location,
            peerPingInterval: 100,
            trackerPingInterval: 100,
            rttUpdateTimeout: 10
        })
    })

    afterEach(async () => {
        await Promise.allSettled([
            nodeOne.stop(),
            nodeTwo.stop(),
            tracker.stop()
        ])
    })

    it('tracker should receive status message from node', (done) => {
        nodeOne.subscribe(new SPID(streamId, 0))
        // @ts-expect-error private field
        tracker.trackerServer.once(TrackerServerEvent.NODE_STATUS_RECEIVED, (statusMessage, peerInfo) => {
            expect(peerInfo).toEqual('node-1')
            done()
        })

        nodeOne.subscribe(new SPID('stream-id', 0))
        nodeOne.start()
    })

    it('tracker should receive status from second node', (done) => {
        nodeTwo.subscribe(new SPID(streamId, 0))
        // @ts-expect-error private field
        tracker.trackerServer.once(TrackerServerEvent.NODE_STATUS_RECEIVED, (statusMessage, peerInfo) => {
            expect(peerInfo).toEqual('node-2')
            done()
        })

        nodeTwo.subscribe(new SPID('stream-id', 0))
        nodeTwo.start()
    })
       
    it('tracker should receive from both nodes new statuses', (done) => {
        let nodeOneStatusReceived = false
        let nodeTwoStatusReceived = false
        let doneCalled = false

        // @ts-expect-error private field
        tracker.trackerServer.on(TrackerServerEvent.NODE_STATUS_RECEIVED, (statusMessage, nodeId) => {

            if (nodeId === 'node-1' && !nodeOneStatusReceived) {
                nodeOneStatusReceived = true
            }

            if (nodeId === 'node-2' && !nodeTwoStatusReceived) {
                nodeTwoStatusReceived = true
            }

            if (nodeOneStatusReceived && nodeTwoStatusReceived && !doneCalled) {
                doneCalled = true
                done()
            }
        })

        nodeOne.subscribe(new SPID('stream-id', 0))
        nodeTwo.subscribe(new SPID('stream-id', 0))
        nodeOne.start()
        nodeTwo.start()

    })
    
    it('tracker should receive rtt values from nodes', () => {
        return new Promise(async (resolve) => {
            let receivedTotal = 0
            let nodeOneStatus: any = null
            let nodeTwoStatus: any = null

            await Promise.all([
                nodeOne.start(),
                nodeTwo.start()
            ])
            
            await runAndWaitForEvents([
                () => { nodeOne.subscribe(new SPID(streamId, 0)) },
                () => { nodeTwo.subscribe(new SPID(streamId, 0)) } ], [
                [nodeOne, NodeEvent.NODE_SUBSCRIBED],
                [nodeTwo, NodeEvent.NODE_SUBSCRIBED],
            ])
            
            await wait(2000)

            // @ts-expect-error private field
            tracker.trackerServer.on(TrackerServerEvent.NODE_STATUS_RECEIVED, (statusMessage, nodeId) => {
                if (nodeId === 'node-1') {
                    nodeOneStatus = statusMessage.status
                    receivedTotal += 1
                }

                if (nodeId === 'node-2') {
                    nodeTwoStatus = statusMessage.status
                    receivedTotal += 1
                }

                if (receivedTotal===2) {
                    expect(nodeOneStatus.rtts['node-2']).toBeGreaterThanOrEqual(0)
                    expect(nodeTwoStatus.rtts['node-1']).toBeGreaterThanOrEqual(0)
                    resolve(true)
                }
            })
            
            nodeOne.subscribe(new SPID(streamId2, 0))
            nodeTwo.subscribe(new SPID(streamId2, 0))
        })
    })
    
    it('tracker should receive location information from nodes', (done) => {
        let receivedTotal = 0
        let nodeOneStatus: any = null
        let nodeTwoStatus: any = null

        nodeOne.start()
        nodeTwo.start()

        nodeOne.subscribe(new SPID(streamId, 0))
        nodeTwo.subscribe(new SPID(streamId, 0))

        // @ts-expect-error private field
        tracker.trackerServer.on(TrackerServerEvent.NODE_STATUS_RECEIVED, (statusMessage, nodeId) => {
            if (nodeId === nodeOne.getNodeId()) {
                nodeOneStatus = statusMessage.status
                // @ts-expect-error private field
                expect(tracker.locationManager.nodeLocations['node-1']).toBeUndefined()
            }

            if (nodeId === nodeTwo.getNodeId()) {
                nodeTwoStatus = statusMessage.status
                // @ts-expect-error private field
                expect(tracker.locationManager.nodeLocations['node-2'].country).toBe('FI')
            }
            receivedTotal += 1
            if (receivedTotal === 2) {
                expect(nodeOneStatus.location).toBeUndefined()
                expect(Object.keys(nodeTwoStatus.location).length).toEqual(2)
                done()
            }
        })
    })
})
