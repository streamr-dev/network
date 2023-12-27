import { DhtNode } from '../../src/dht/DhtNode'
import { Simulator } from '../../src/connection/simulator/Simulator'
import { createRandomDhtAddress } from '../../src/identifiers'
import { createMockConnectionDhtNode } from '../utils/utils'
import { areEqualPeerDescriptors } from '../../src/helpers/peerIdFromPeerDescriptor'

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
        expect(areEqualPeerDescriptors(info1.neighbors[0], entryPoint.getLocalPeerDescriptor())).toEqual(true)
        expect(areEqualPeerDescriptors(info2.neighbors[0], dhtNode.getLocalPeerDescriptor())).toEqual(true)
        expect(areEqualPeerDescriptors(info1.connections[0], entryPoint.getLocalPeerDescriptor())).toEqual(true)
        expect(areEqualPeerDescriptors(info2.connections[0], dhtNode.getLocalPeerDescriptor())).toEqual(true)    
    })

})
