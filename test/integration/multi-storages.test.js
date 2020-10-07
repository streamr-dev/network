const { waitForEvent, waitForCondition } = require('streamr-test-utils')

const { startStorageNode, startNetworkNode, startTracker } = require('../../src/composition')
const TrackerServer = require('../../src/protocol/TrackerServer')

describe('multiple storage nodes', () => {
    let tracker
    let storageOne
    let storageTwo
    let storageThree
    let node

    const trackerPort = 49800
    const storageOnePort = 49801
    const storageTwoPort = 49803
    const storageThreePort = 49804
    const nodePort = 49805

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: trackerPort,
            id: 'tracker'
        })

        node = await startNetworkNode('127.0.0.1', nodePort, 'node')
        storageOne = await startStorageNode('127.0.0.1', storageOnePort, 'storageOne')
        storageTwo = await startStorageNode('127.0.0.1', storageTwoPort, 'storageTwo')
        storageThree = await startStorageNode('127.0.0.1', storageThreePort, 'storageThree')

        node.addBootstrapTracker(tracker.getAddress())
        storageOne.addBootstrapTracker(tracker.getAddress())
        storageTwo.addBootstrapTracker(tracker.getAddress())
    })

    afterEach(async () => {
        await node.stop()
        await tracker.stop()
        await storageOne.stop()
        await storageTwo.stop()
        await storageThree.stop()
    })

    test('all storages node are assigned to all streams', async () => {
        node.subscribe('stream-1', 0)
        node.subscribe('stream-2', 0)

        await waitForCondition(() => Object.keys(tracker.getTopology()).length === 2)

        expect(tracker.getTopology()).toEqual({
            'stream-1::0': {
                node: ['storageOne', 'storageTwo'],
                storageOne: ['node', 'storageTwo'],
                storageTwo: ['node', 'storageOne']
            },
            'stream-2::0': {
                node: ['storageOne', 'storageTwo'],
                storageOne: ['node', 'storageTwo'],
                storageTwo: ['node', 'storageOne']
            }
        })

        expect(tracker.getStorageNodes()).toEqual(['storageOne', 'storageTwo'])
    })

    test('newly joined storage node is subscribed to all existing streams', async () => {
        node.subscribe('stream-1', 0)
        node.subscribe('stream-2', 0)
        node.subscribe('stream-3', 0)

        await waitForCondition(() => Object.keys(tracker.getTopology()).length === 3)
        storageThree.addBootstrapTracker(tracker.getAddress())

        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)

        expect(tracker.getTopology()['stream-1::0'].storageThree).toEqual([
            'node', 'storageOne', 'storageTwo'
        ])
        expect(tracker.getTopology()['stream-2::0'].storageThree).toEqual([
            'node', 'storageOne', 'storageTwo'
        ])
        expect(tracker.getTopology()['stream-3::0'].storageThree).toEqual([
            'node', 'storageOne', 'storageTwo'
        ])
    })
})
