import { Tracker } from '../../src/logic/Tracker'
import { NetworkNode } from '../../src/NetworkNode'
import { waitForEvent, waitForCondition } from 'streamr-test-utils'

import { startStorageNode, startNetworkNode, startTracker } from '../../src/composition'
import { Event as TrackerServerEvent } from '../../src/protocol/TrackerServer'
import { Event as NodeEvent } from '../../src/logic/Node'
import { getTopology } from '../../src/logic/trackerSummaryUtils'

describe('multiple storage nodes', () => {
    let tracker: Tracker
    let storageOne: NetworkNode
    let storageTwo: NetworkNode
    let storageThree: NetworkNode
    let node: NetworkNode

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
            // @ts-expect-error private method
            waitForEvent(tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED),
            waitForEvent(storageThree, NodeEvent.NODE_SUBSCRIBED)
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
