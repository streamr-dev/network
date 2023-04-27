import { NetworkNode } from '../../src/logic/NetworkNode'
import { Tracker } from '@streamr/network-tracker'
import { createTestNetworkNode, startTestTracker } from '../utils'
import { ProxyDirection, toStreamID, toStreamPartID } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'

describe('NetworkNode', () => {
    let tracker: Tracker
    let node: NetworkNode

    beforeEach(async () => {
        tracker = await startTestTracker({
            port: 30410
        })
        node = createTestNetworkNode({
            id: 'node-1',
            trackers: [tracker.getConfigRecord()]
        })
    })

    afterEach(async () => {
        await tracker.stop()
        await node.stop()
    })

    it('has id & peerInfo', () => {
        expect(node.getNodeId()).toEqual(node.peerInfo.peerId)
        expect(node.peerInfo.isNode()).toEqual(true)
        expect(node.peerInfo.isTracker()).toEqual(false)
    })

    it('setProxies throws error if acceptProxyConnections=true (NET-950)', async () => {
        const node = createTestNetworkNode({
            id: 'node-2',
            trackers: [tracker.getConfigRecord()],
            acceptProxyConnections: true
        })
        try {
            await expect(() => node!.setProxies(
                toStreamPartID(toStreamID('/foobar', randomEthereumAddress()), 0),
                ['0xa', '0xb'],
                ProxyDirection.SUBSCRIBE,
                () => Promise.resolve(''),
                1
            )).rejects.toThrow('cannot set proxies when acceptProxyConnections=true')
        } finally {
            await node.stop()
        }
    })
})
