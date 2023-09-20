import { DhtNode, Simulator } from '../../src/exports'
import { createMockConnectionDhtNode } from '../utils/utils'

describe('DhtNode getInfo', () => {
    let entryPoint: DhtNode
    let dhtNode: DhtNode
    let simulator: Simulator
    const entryPointId = '0'
    const dhtNodeId = '1'

    beforeEach(async () => {
        simulator = new Simulator()
        entryPoint = await createMockConnectionDhtNode(entryPointId, simulator)
        dhtNode = await createMockConnectionDhtNode(dhtNodeId, simulator)
        await entryPoint.joinDht([entryPoint.getPeerDescriptor()])
        await dhtNode.joinDht([entryPoint.getPeerDescriptor()])
    })

    afterEach(async () => {
        await dhtNode.stop()
        await entryPoint.stop()
    })

    it('getInfo returns correct info', () => {
        const info1 = dhtNode.getInfo()
        const info2 = entryPoint.getInfo()
        expect(info1.kBucket[0]).toEqual(entryPoint.getPeerDescriptor())
        expect(info2.kBucket[0]).toEqual(dhtNode.getPeerDescriptor())
        expect(info1.neighborList[0]).toEqual(entryPoint.getPeerDescriptor())
        expect(info2.neighborList[0]).toEqual(dhtNode.getPeerDescriptor())
    })

})
