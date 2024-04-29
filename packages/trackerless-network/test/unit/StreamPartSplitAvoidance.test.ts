import { StreamPartSplitAvoidance } from '../../src/logic/StreamPartSplitAvoidance'
import { MockLayer1Node } from '../utils/mock/MockLayer1Node'

describe('StreamPartSplitAvoidance', () => {

    let streamPartSplitAvoidance: StreamPartSplitAvoidance
    let layer1Node: MockLayer1Node
    
    beforeEach(() => {
        layer1Node = new MockLayer1Node()
        streamPartSplitAvoidance = new StreamPartSplitAvoidance({
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

    it('runs avoidance until number of neighbors is above SPLIT_AVOIDANCE_LIMIT', async () => {
        await streamPartSplitAvoidance.avoidNetworkSplit()
        expect(layer1Node.getNeighborCount()).toBeGreaterThan(4)
    })

})
