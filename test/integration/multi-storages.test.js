const { waitForEvent, waitForCondition } = require('streamr-test-utils')

const { startStorageNode, startNetworkNode, startTracker } = require('../../src/composition')
const TrackerServer = require('../../src/protocol/TrackerServer')
const Node = require('../../src/logic/Node')
const { getTopology } = require('../../src/logic/TopologyFactory')

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

        node = await startNetworkNode({
            host: '127.0.0.1',
            port: nodePort,
            id: 'node',
            trackers: [tracker.getAddress()]
        })
        storageOne = await startStorageNode({
            host: '127.0.0.1',
            port: storageOnePort,
            id: 'storageOne',
            trackers: [tracker.getAddress()]
        })
        storageTwo = await startStorageNode({
            host: '127.0.0.1',
            port: storageTwoPort,
            id: 'storageTwo',
            trackers: [tracker.getAddress()]
        })
        storageThree = await startStorageNode({
            host: '127.0.0.1',
            port: storageThreePort,
            id: 'storageThree',
            trackers: [tracker.getAddress()]
        })

        node.start()
        storageOne.start()
        storageTwo.start()
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

        await waitForCondition(() => Object.keys(getTopology(tracker.getOverlayPerStream())).length === 2)

        expect(getTopology(tracker.getOverlayPerStream())).toEqual({
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

        await waitForCondition(() => Object.keys(getTopology(tracker.getOverlayPerStream())).length === 3)
        storageThree.start()

        await Promise.all([
            waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(storageThree, Node.events.NODE_SUBSCRIBED)
        ])

        expect(getTopology(tracker.getOverlayPerStream())['stream-1::0'].storageThree).toEqual([
            'node', 'storageOne', 'storageTwo'
        ])
        expect(getTopology(tracker.getOverlayPerStream())['stream-2::0'].storageThree).toEqual([
            'node', 'storageOne', 'storageTwo'
        ])
        expect(getTopology(tracker.getOverlayPerStream())['stream-3::0'].storageThree).toEqual([
            'node', 'storageOne', 'storageTwo'
        ])
    })
})
