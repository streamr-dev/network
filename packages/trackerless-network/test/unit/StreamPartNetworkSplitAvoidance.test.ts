import { MIN_NEIGHBOR_COUNT, StreamPartNetworkSplitAvoidance } from '../../src/logic/StreamPartNetworkSplitAvoidance'
import { MockDiscoveryLayerNode } from '../utils/mock/MockDiscoveryLayerNode'

describe('StreamPartNetworkSplitAvoidance', () => {
    let avoidance: StreamPartNetworkSplitAvoidance
    let discoveryLayerNode: MockDiscoveryLayerNode

    beforeEach(() => {
        discoveryLayerNode = new MockDiscoveryLayerNode()
        avoidance = new StreamPartNetworkSplitAvoidance({
            discoveryLayerNode,
            discoverEntryPoints: async () => {
                discoveryLayerNode.addNewRandomPeerToKBucket()
                return discoveryLayerNode.getNeighbors()
            },
            exponentialRunOfBaseDelay: 1
        })
    })

    afterEach(() => {
        discoveryLayerNode.stop()
        avoidance.destroy()
    })

    it('runs avoidance until number of neighbors is above MIN_NEIGHBOR_COUNT', async () => {
        await avoidance.avoidNetworkSplit()
        expect(discoveryLayerNode.getNeighborCount()).toBeGreaterThan(MIN_NEIGHBOR_COUNT)
    })
})
