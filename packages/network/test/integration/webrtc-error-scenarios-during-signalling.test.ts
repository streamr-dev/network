import { runAndWaitForEvents } from 'streamr-test-utils'

import { Tracker } from '../../src/logic/tracker/Tracker'
import { NetworkNode } from '../../src/logic/node/NetworkNode'
import { createNetworkNode, startTracker } from '../../src/composition'
import { Event as NodeEvent } from '../../src/logic/node/Node'
import { Event as NodeToTrackerEvent } from '../../src/protocol/NodeToTracker'

/**
 * Tests for error scenarios during signalling
 */
describe('Signalling error scenarios', () => {
    let tracker: Tracker
    let nodeOne: NetworkNode
    let nodeTwo: NetworkNode
    const streamId = 'stream-1'

    beforeEach(async () => {
        tracker = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 35115
            },
            id: 'tracker',
            trackerPingInterval: 3000
        })
        const trackerInfo = { id: 'tracker', ws: tracker.getUrl(), http: tracker.getUrl() }

        nodeOne = createNetworkNode({
            id: 'node-1',
            trackers: [trackerInfo],
            disconnectionWaitTime: 4000,
            newWebrtcConnectionTimeout: 8000,
            trackerPingInterval: 3000
        })
        nodeTwo = createNetworkNode({
            id: 'node-2',
            trackers: [trackerInfo],
            disconnectionWaitTime: 4000,
            newWebrtcConnectionTimeout: 8000,
            trackerPingInterval: 3000
        })

        nodeOne.start()
        nodeTwo.start()
    })

    afterEach(async () => {

        await tracker.stop()
        await nodeOne.stop()
        await nodeTwo.stop()

    })
    
    it('connection recovers after timeout if one endpoint closes during signalling', async () => {

        let closed = false
        // @ts-expect-error private field
        const originalEmit = nodeTwo.trackerManager.nodeToTracker.emit.bind(nodeTwo.trackerManager.nodeToTracker)

        // @ts-expect-error private field
        const spy = jest.spyOn(nodeTwo.trackerManager.nodeToTracker, 'emit').mockImplementation((event, ...args) => {
            if (event === NodeToTrackerEvent.RELAY_MESSAGE_RECEIVED) {
                if (!closed) {
                    // @ts-expect-error private field
                    if (nodeTwo.nodeToNode.endpoint.connections.hasOwnProperty('node-1')) {
                        closed = true
                        spy.mockRestore()

                        // @ts-expect-error private field
                        return nodeTwo.nodeToNode.endpoint.connections['node-1'].close()
                    }
                }
            }
            return originalEmit(event, ...args)
        })

        await runAndWaitForEvents([
            () => { nodeOne.subscribe(streamId, 0) },
            () => { nodeTwo.subscribe(streamId, 0) }], [
            [nodeOne, NodeEvent.NODE_CONNECTED],
            [nodeTwo, NodeEvent.NODE_CONNECTED]
        ], 30000)

        expect(closed).toBe(true)

        // @ts-expect-error private field
        expect(Object.keys(nodeTwo.nodeToNode.endpoint.connections)).toEqual(['node-1'])
    }, 60000)
    
    it('connection recovers after timeout if both endpoints close during signalling', async () => {
        
        let closedOne = false
        // @ts-expect-error private field
        const originalEmitOne = nodeOne.trackerManager.nodeToTracker.emit.bind(nodeOne.trackerManager.nodeToTracker)

        // @ts-expect-error private field
        const spyOne = jest.spyOn(nodeOne.trackerManager.nodeToTracker, 'emit').mockImplementation((event, ...args) => {
            if (event === NodeToTrackerEvent.RELAY_MESSAGE_RECEIVED) {
                if (!closedOne) {
                    // @ts-expect-error private field
                    if (nodeOne.nodeToNode.endpoint.connections.hasOwnProperty('node-2')) {
                        closedOne = true
                        spyOne.mockRestore()

                        // @ts-expect-error private field
                        return nodeOne.nodeToNode.endpoint.connections['node-2'].close()
                    }
                }
            }
            return originalEmitOne(event, ...args)
        })

        let closedTwo = false
        // @ts-expect-error private field
        const originalEmitTwo = nodeTwo.trackerManager.nodeToTracker.emit.bind(nodeTwo.trackerManager.nodeToTracker)

        // @ts-expect-error private field
        const spyTwo = jest.spyOn(nodeTwo.trackerManager.nodeToTracker, 'emit').mockImplementation((event, ...args) => {
            if (event === NodeToTrackerEvent.RELAY_MESSAGE_RECEIVED) {
                if (!closedTwo) {
                    // @ts-expect-error private field
                    if (nodeTwo.nodeToNode.endpoint.connections.hasOwnProperty('node-1')) {
                        closedTwo = true
                        spyTwo.mockRestore()

                        // @ts-expect-error private field
                        return nodeTwo.nodeToNode.endpoint.connections['node-1'].close()
                    }
                }
            }
            return originalEmitTwo(event, ...args)
        })

        await runAndWaitForEvents([
            () => { nodeOne.subscribe(streamId, 0) },
            () => { nodeTwo.subscribe(streamId, 0) }], [
            [nodeOne, NodeEvent.NODE_CONNECTED],
            [nodeTwo, NodeEvent.NODE_CONNECTED]
        ], 30000)

        expect(closedOne).toBe(true)
        expect(closedTwo).toBe(true)

        // @ts-expect-error private field
        expect(Object.keys(nodeOne.nodeToNode.endpoint.connections)).toEqual(['node-2'])
        // @ts-expect-error private field
        expect(Object.keys(nodeTwo.nodeToNode.endpoint.connections)).toEqual(['node-1'])
    }, 60000)

    it('nodes recover if both signaller connections fail during signalling', async () => {

        let closedOne = false
        // @ts-expect-error private field
        const originalEmitOne = nodeOne.trackerManager.nodeToTracker.emit.bind(nodeOne.trackerManager.nodeToTracker)

        // @ts-expect-error private field
        const spyOne = jest.spyOn(nodeOne.trackerManager.nodeToTracker, 'emit').mockImplementation((event, ...args) => {
            if (event === NodeToTrackerEvent.RELAY_MESSAGE_RECEIVED) {
                if (!closedOne) {
                    closedOne = true
                    spyOne.mockRestore()

                    // @ts-expect-error private field
                    return nodeOne.trackerManager.nodeToTracker.endpoint.close('tracker')
                }
            }
            return originalEmitOne(event, ...args)
        })

        let closedTwo = false
        // @ts-expect-error private field
        const originalEmitTwo = nodeTwo.trackerManager.nodeToTracker.emit.bind(nodeTwo.trackerManager.nodeToTracker)

        // @ts-expect-error private field
        const spyTwo = jest.spyOn(nodeTwo.trackerManager.nodeToTracker, 'emit').mockImplementation((event, ...args) => {
            if (event === NodeToTrackerEvent.RELAY_MESSAGE_RECEIVED) {
                if (!closedTwo) {
                    closedTwo = true
                    spyTwo.mockRestore()

                    // @ts-expect-error private field
                    return nodeTwo.trackerManager.nodeToTracker.endpoint.close('tracker')
                }
            }
            return originalEmitTwo(event, ...args)
        })

        await runAndWaitForEvents([
            () => { nodeOne.subscribe('stream-id', 0) },
            () => { nodeTwo.subscribe('stream-id', 0) }], [

            // @ts-expect-error private field
            [nodeOne.trackerManager.nodeToTracker, NodeToTrackerEvent.TRACKER_DISCONNECTED],
            // @ts-expect-error private field
            [nodeTwo.trackerManager.nodeToTracker, NodeToTrackerEvent.TRACKER_DISCONNECTED],

            [nodeOne, NodeEvent.NODE_CONNECTED],
            [nodeTwo, NodeEvent.NODE_CONNECTED]

        ], 120000)

        expect(closedOne).toBe(true)
        expect(closedTwo).toBe(true)

        // @ts-expect-error private field
        expect(Object.keys(nodeOne.nodeToNode.endpoint.connections)).toEqual(['node-2'])
        // @ts-expect-error private field
        expect(Object.keys(nodeTwo.nodeToNode.endpoint.connections)).toEqual(['node-1'])
    }, 240000)
    
    it('nodes recover if one signaller connection fails during signalling', async () => {

        let closedOne = false
        // @ts-expect-error private field
        const originalEmitOne = nodeOne.trackerManager.nodeToTracker.emit.bind(nodeOne.trackerManager.nodeToTracker)

        // @ts-expect-error private field
        const spyOne = jest.spyOn(nodeOne.trackerManager.nodeToTracker, 'emit').mockImplementation((event, ...args) => {
            if (event === NodeToTrackerEvent.RELAY_MESSAGE_RECEIVED) {
                if (!closedOne) {
                    closedOne = true
                    spyOne.mockRestore()

                    // @ts-expect-error private field
                    return nodeOne.trackerManager.nodeToTracker.endpoint.close('tracker')
                }
            }
            return originalEmitOne(event, ...args)
        })

        await runAndWaitForEvents([
            () => { nodeOne.subscribe('stream-id', 0) },
            () => { nodeTwo.subscribe('stream-id', 0) }], [

            // @ts-expect-error private field
            [nodeOne.trackerManager.nodeToTracker, NodeToTrackerEvent.TRACKER_DISCONNECTED],
           
            [nodeOne, NodeEvent.NODE_CONNECTED],
            [nodeTwo, NodeEvent.NODE_CONNECTED]

        ], 120000)

        expect(closedOne).toBe(true)

        // @ts-expect-error private field
        expect(Object.keys(nodeOne.nodeToNode.endpoint.connections)).toEqual(['node-2'])
        // @ts-expect-error private field
        expect(Object.keys(nodeTwo.nodeToNode.endpoint.connections)).toEqual(['node-1'])
    }, 30000)
})
