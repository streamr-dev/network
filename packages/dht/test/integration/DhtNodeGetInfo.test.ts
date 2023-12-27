import { DhtNode, Simulator } from '../../src/exports'
import { createRandomDhtAddress } from '../../src/identifiers'
import { createMockConnectionDhtNode } from '../utils/utils'

describe('DhtNode getInfo', () => {
    let entryPoint: DhtNode
    let dhtNode: DhtNode
    let simulator: Simulator
    const entryPointId = createRandomDhtAddress()
    const dhtNodeId = createRandomDhtAddress()

    beforeEach(async () => {
        simulator = new Simulator()
        entryPoint = await createMockConnectionDhtNode(simulator, entryPointId)
        dhtNode = await createMockConnectionDhtNode(simulator, dhtNodeId)
        await entryPoint.joinDht([entryPoint.getLocalPeerDescriptor()])
        await dhtNode.joinDht([entryPoint.getLocalPeerDescriptor()])
    })

    afterEach(async () => {
        await dhtNode.stop()
        await entryPoint.stop()
    })

    it('getInfo returns correct info', () => {
        const info1 = dhtNode.getInfo()
        const info2 = entryPoint.getInfo()
        expect(info1.kBucket[0]).toEqual(entryPoint.getLocalPeerDescriptor())
        expect(info2.kBucket[0]).toEqual(dhtNode.getLocalPeerDescriptor())
        expect(info1.connections[0]).toEqual(entryPoint.getLocalPeerDescriptor())
        expect(info2.connections[0]).toEqual(dhtNode.getLocalPeerDescriptor())    
    })

})
