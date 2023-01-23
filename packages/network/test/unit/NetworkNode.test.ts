import { NetworkNode } from '../../src/logic/NetworkNode'
import { Tracker } from '@streamr/network-tracker'
import { createTestNetworkNode, startTestTracker } from '../utils'

describe('NetworkNode', () => {
    let tracker: Tracker
    let node: NetworkNode
    beforeEach(async () => {
        tracker = await startTestTracker({
            port: 30410
        })
        const trackerInfo = tracker.getConfigRecord()
        node = createTestNetworkNode({
            id: 'node-1',
            trackers: [trackerInfo]
        })
    })

    it('has id & peerInfo', () => {
        expect(node.getNodeId()).toEqual(node.peerInfo.peerId)
        expect(node.peerInfo.isNode()).toEqual(true)
        expect(node.peerInfo.isTracker()).toEqual(false)
    })

    afterEach(async () => {
        await tracker.stop()
        await node.stop()
    })
})
