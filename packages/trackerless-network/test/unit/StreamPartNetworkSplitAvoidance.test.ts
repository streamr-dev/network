import { MIN_NEIGHBOR_COUNT } from '../../src/logic/StreamPartNetworkSplitAvoidance'
import { StreamPartNetworkSplitAvoidance } from '../../src/logic/StreamPartNetworkSplitAvoidance'
import { MockLayer1Node } from '../utils/mock/MockLayer1Node'

describe('StreamPartSplitAvoidance', () => {

    let streamPartSplitAvoidance: StreamPartNetworkSplitAvoidance
    let layer1Node: MockLayer1Node
    
    beforeEach(() => {
        layer1Node = new MockLayer1Node()
        streamPartSplitAvoidance = new StreamPartNetworkSplitAvoidance({
            layer1Node,
            discoverEntryPoints: async () => { 
                layer1Node.addNewRandomPeerToKBucket() 
                return layer1Node.getNeighbors()
            },
            exponentialRunOfBaseDelay: 1
        })
    })

    afterEach(() => {
        layer1Node.stop()
        streamPartSplitAvoidance.destroy()
    })

    it('runs avoidance until number of neighbors is above MIN_NEIGHBOR_COUNT', async () => {
        await streamPartSplitAvoidance.avoidNetworkSplit()
        expect(layer1Node.getNeighborCount()).toBeGreaterThan(MIN_NEIGHBOR_COUNT)
    })

})
