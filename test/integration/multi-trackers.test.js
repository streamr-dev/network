const { waitForEvent } = require('streamr-test-utils')
const { TrackerLayer } = require('streamr-client-protocol')

const { startNetworkNode, startTracker } = require('../../src/composition')
const TrackerServer = require('../../src/protocol/TrackerServer')
const Node = require('../../src/logic/Node')

// TODO: maybe worth re-designing this in a way that isn't this arbitrary?
const FIRST_STREAM = 'stream-1' // assigned to trackerOne (arbitrarily by hashing algo)
const SECOND_STREAM = 'stream-8' // assigned to trackerTwo
const THIRD_STREAM = 'stream-9' // assigned to trackerThree

describe('multi trackers', () => {
    let trackerOne
    let trackerTwo
    let trackerThree
    let nodeOne
    let nodeTwo

    beforeEach(async () => {
        trackerOne = await startTracker({
            host: '127.0.0.1',
            port: 49000,
            id: 'trackerOne'
        })
        trackerTwo = await startTracker({
            host: '127.0.0.1',
            port: 49001,
            id: 'trackerTwo'
        })
        trackerThree = await startTracker({
            host: '127.0.0.1',
            port: 49002,
            id: 'trackerThree'
        })
        const trackerAddresses = [trackerOne.getAddress(), trackerTwo.getAddress(), trackerThree.getAddress()]
        nodeOne = await startNetworkNode({
            host: '127.0.0.1',
            port: 49003,
            id: 'nodeOne',
            trackers: trackerAddresses
        })
        nodeTwo = await startNetworkNode({
            host: '127.0.0.1',
            port: 49004,
            id: 'nodeTwo',
            trackers: trackerAddresses
        })
    })

    afterEach(async () => {
        jest.restoreAllMocks()

        await nodeOne.stop()
        await nodeTwo.stop()

        await trackerOne.stop()
        await trackerTwo.stop()
        await trackerThree.stop()
    })

    test('node sends stream status to specific tracker', async () => {
        nodeOne.start()

        await Promise.all([
            waitForEvent(trackerOne.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(trackerTwo.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(trackerThree.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        ])

        const spyTrackerOne = jest.spyOn(trackerOne, 'processNodeStatus')
        const spyTrackerTwo = jest.spyOn(trackerTwo, 'processNodeStatus')
        const spyTrackerThree = jest.spyOn(trackerThree, 'processNodeStatus')

        // first stream, first tracker
        nodeOne.subscribe(FIRST_STREAM, 0)

        await Promise.race([
            waitForEvent(trackerOne.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(trackerTwo.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(trackerThree.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
        ])

        expect(spyTrackerOne).toBeCalledTimes(1)
        expect(spyTrackerTwo).not.toBeCalled()
        expect(spyTrackerThree).not.toBeCalled()
        jest.clearAllMocks()

        // second stream, second tracker
        nodeOne.subscribe(SECOND_STREAM, 0)

        await Promise.race([
            waitForEvent(trackerOne.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(trackerTwo.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(trackerThree.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
        ])

        expect(spyTrackerOne).not.toBeCalled()
        expect(spyTrackerTwo).toBeCalledTimes(1)
        expect(spyTrackerThree).not.toBeCalled()
        jest.clearAllMocks()

        // third stream, third tracker
        nodeOne.subscribe(THIRD_STREAM, 0)

        await Promise.race([
            waitForEvent(trackerOne.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(trackerTwo.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(trackerThree.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
        ])

        expect(spyTrackerOne).not.toBeCalled()
        expect(spyTrackerTwo).not.toBeCalled()
        expect(spyTrackerThree).toBeCalledTimes(1)
    })

    test('only one specific tracker sends instructions about stream', async () => {
        nodeOne.start()

        await Promise.all([
            waitForEvent(trackerOne.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(trackerTwo.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(trackerThree.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        ])

        nodeTwo.start()

        await Promise.all([
            waitForEvent(trackerOne.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(trackerTwo.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(trackerThree.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        ])

        const spyNodeOne = jest.spyOn(nodeOne, 'onTrackerInstructionReceived')
        const spyNodeTwo = jest.spyOn(nodeTwo, 'onTrackerInstructionReceived')

        const spyTrackerOne = jest.spyOn(trackerOne.protocols.trackerServer, 'sendInstruction')
        const spyTrackerTwo = jest.spyOn(trackerTwo.protocols.trackerServer, 'sendInstruction')
        const spyTrackerThree = jest.spyOn(trackerThree.protocols.trackerServer, 'sendInstruction')

        // first stream, first tracker
        nodeOne.subscribe(FIRST_STREAM, 0)
        nodeTwo.subscribe(FIRST_STREAM, 0)

        await Promise.all([
            waitForEvent(nodeOne, Node.events.NODE_SUBSCRIBED),
            waitForEvent(nodeTwo, Node.events.NODE_SUBSCRIBED)
        ])

        expect(spyNodeOne).toBeCalledTimes(0)
        expect(spyNodeTwo).toBeCalledTimes(1)

        expect(spyTrackerOne).toBeCalledTimes(1)
        expect(spyTrackerTwo).toBeCalledTimes(0)
        expect(spyTrackerThree).toBeCalledTimes(0)
        jest.clearAllMocks()

        // second stream, second tracker
        nodeOne.subscribe(SECOND_STREAM, 0)
        nodeTwo.subscribe(SECOND_STREAM, 0)

        await Promise.all([
            waitForEvent(nodeOne, Node.events.NODE_SUBSCRIBED),
            waitForEvent(nodeTwo, Node.events.NODE_SUBSCRIBED)
        ])

        expect(spyNodeOne).toBeCalledTimes(0)
        expect(spyNodeTwo).toBeCalledTimes(1)

        expect(spyTrackerOne).toBeCalledTimes(0)
        expect(spyTrackerTwo).toBeCalledTimes(1)
        expect(spyTrackerThree).toBeCalledTimes(0)
        jest.clearAllMocks()

        // third stream, third tracker
        nodeOne.subscribe(THIRD_STREAM, 0)
        nodeTwo.subscribe(THIRD_STREAM, 0)

        await Promise.all([
            waitForEvent(nodeOne, Node.events.NODE_SUBSCRIBED),
            waitForEvent(nodeTwo, Node.events.NODE_SUBSCRIBED)
        ])

        expect(spyNodeOne).toBeCalledTimes(0)
        expect(spyNodeTwo).toBeCalledTimes(1)

        expect(spyTrackerOne).toBeCalledTimes(0)
        expect(spyTrackerTwo).toBeCalledTimes(0)
        expect(spyTrackerThree).toBeCalledTimes(1)
        jest.clearAllMocks()
    })

    test('node ignores instructions from unexpected tracker', async () => {
        nodeOne.start()

        await Promise.all([
            waitForEvent(trackerOne.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(trackerTwo.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(trackerThree.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        ])

        nodeOne.subscribe('stream-1', 0)

        await waitForEvent(trackerOne.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)

        const spyOnTrackerInstructionReceived = jest.spyOn(nodeOne, 'onTrackerInstructionReceived')
        const subscribeToStreamIfHaveNotYet = jest.spyOn(nodeOne, 'subscribeToStreamIfHaveNotYet')

        const trackerInstruction = new TrackerLayer.InstructionMessage({
            requestId: 'requestId',
            streamId: 'stream-1',
            streamPartition: 0,
            nodeAddresses: [
                'node-address-1',
                'node-address-2'
            ],
            counter: 0
        })

        await nodeOne.onTrackerInstructionReceived('trackerTwo', trackerInstruction)

        expect(spyOnTrackerInstructionReceived).toBeCalledTimes(1)
        expect(subscribeToStreamIfHaveNotYet).not.toBeCalled()
    })
})
