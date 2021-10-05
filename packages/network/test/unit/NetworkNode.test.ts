import { NetworkNode } from '../../src/logic/node/NetworkNode'
import { Tracker } from '../../src/logic/tracker/Tracker'

import { createNetworkNode, startTracker } from '../../src/composition'

describe('NetworkNode', () => {
    let tracker: Tracker
    let node: NetworkNode
    beforeEach(async () => {
        tracker = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 30410
            },
            id: 'tracker'
        })
        const trackerInfo = { id: 'tracker', ws: tracker.getUrl(), http: tracker.getUrl() }
        node = createNetworkNode({
            id: 'node-1',
            trackers: [trackerInfo]
        })
    })

    it('has id & peerInfo', () => {
        expect(node.getNodeId()).toEqual(node.peerInfo.peerId)
        expect(node.peerInfo.isNode()).toBeTrue()
        expect(node.peerInfo.isTracker()).toBeFalse()
    })

    afterEach(async () => {
        await tracker.stop()
        await node.stop()
    })
})
