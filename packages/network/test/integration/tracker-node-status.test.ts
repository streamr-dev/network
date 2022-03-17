import { Tracker } from '../../../network-tracker/src/logic/Tracker'
import { NetworkNode } from '../../src/logic/NetworkNode'

import { wait, runAndWaitForEvents } from 'streamr-test-utils'

import { createNetworkNode, startTracker } from '../../src/composition'
import { Event as TrackerServerEvent } from '../../../network-tracker/src/protocol/TrackerServer'
import { Event as NodeEvent } from '../../src/logic/Node'
import { StreamPartIDUtils } from 'streamr-client-protocol'

/**
 * This test verifies that tracker receives status messages from nodes with list of neighbor connections
 */

// Seems to only be able to perform one connection on the tracker using the split ws client/server (???)
describe('check status message flow between tracker and two nodes', () => {
    let tracker: Tracker
    let nodeOne: NetworkNode
    let nodeTwo: NetworkNode
    const streamPartIdOne = StreamPartIDUtils.parse('stream-1#0')
    const streamPartIdTwo = StreamPartIDUtils.parse('stream-2#0')
    const streamPartIdThree = StreamPartIDUtils.parse('stream-3#0')

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
            rttUpdateTimeout: 10,
            webrtcDisallowPrivateAddresses: false
        })

        nodeTwo = createNetworkNode({
            id: 'node-2',
            trackers: [trackerInfo],
            location,
            peerPingInterval: 100,
            trackerPingInterval: 100,
            rttUpdateTimeout: 10,
            webrtcDisallowPrivateAddresses: false
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
        nodeOne.subscribe(streamPartIdOne)
        // @ts-expect-error private field
        tracker.trackerServer.once(TrackerServerEvent.NODE_STATUS_RECEIVED, (statusMessage, peerInfo) => {
            expect(peerInfo).toEqual('node-1')
            done()
        })

        nodeOne.subscribe(streamPartIdThree)
        nodeOne.start()
    })

    it('tracker should receive status from second node', (done) => {
        nodeTwo.subscribe(streamPartIdOne)
        // @ts-expect-error private field
        tracker.trackerServer.once(TrackerServerEvent.NODE_STATUS_RECEIVED, (statusMessage, peerInfo) => {
            expect(peerInfo).toEqual('node-2')
            done()
        })

        nodeTwo.subscribe(streamPartIdThree)
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

        nodeOne.subscribe(streamPartIdThree)
        nodeTwo.subscribe(streamPartIdThree)
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
                () => { nodeOne.subscribe(streamPartIdOne) },
                () => { nodeTwo.subscribe(streamPartIdOne) } ], [
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
            
            nodeOne.subscribe(streamPartIdTwo)
            nodeTwo.subscribe(streamPartIdTwo)
        })
    })
    
    it('tracker should receive location information from nodes', (done) => {
        let receivedTotal = 0
        let nodeOneStatus: any = null
        let nodeTwoStatus: any = null

        nodeOne.start()
        nodeTwo.start()

        nodeOne.subscribe(streamPartIdOne)
        nodeTwo.subscribe(streamPartIdOne)

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
