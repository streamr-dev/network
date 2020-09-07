const { wait, waitForEvent, waitForCondition } = require('streamr-test-utils')

const { startStorageNode, startNetworkNode, startTracker } = require('../../src/composition')
const TrackerServer = require('../../src/protocol/TrackerServer')
const { LOCALHOST } = require('../util')

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
        tracker = await startTracker(LOCALHOST, trackerPort, 'tracker')

        node = await startNetworkNode(LOCALHOST, nodePort, 'node')
        storageOne = await startStorageNode(LOCALHOST, storageOnePort, 'storageOne')
        storageTwo = await startStorageNode(LOCALHOST, storageTwoPort, 'storageTwo')
        storageThree = await startStorageNode(LOCALHOST, storageThreePort, 'storageThree')

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

        // TODO why node is not subscribed to both? weird topologies
        expect(tracker.getTopology()).toEqual({
            'stream-1::0': {
                node: ['storageTwo'],
                storageOne: ['storageTwo'],
                storageTwo: ['node', 'storageOne']
            },
            'stream-2::0': {
                node: ['storageTwo'],
                storageOne: ['storageTwo'],
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
