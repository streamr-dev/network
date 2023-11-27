import { DhtNode } from '../../src/dht/DhtNode'
import { LatencyType, Simulator } from '../../src/connection/simulator/Simulator'
import { createMockConnectionDhtNode, createMockPeerDescriptor } from '../utils/utils'
import { Any } from '../../src/proto/google/protobuf/any'
import { PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { areEqualPeerDescriptors } from '../../src/helpers/peerIdFromPeerDescriptor'
import { createRandomKademliaId } from '../../src/helpers/kademliaId'

describe('DhtNodeExternalApi', () => {

    let simulator: Simulator
    let dhtNode1: DhtNode
    let remote: DhtNode

    beforeEach(async () => {
        simulator = new Simulator(LatencyType.NONE)
        dhtNode1 = await createMockConnectionDhtNode('node1', simulator)
        remote = await createMockConnectionDhtNode('remote', simulator)
        await dhtNode1.joinDht([dhtNode1.getLocalPeerDescriptor()])
    })

    afterEach(async () => {
        await Promise.all([
            dhtNode1.stop(),
            remote.stop()
        ])
        simulator.stop()
    })

    it('findData happy path', async () => {
        const data = Any.pack(dhtNode1.getLocalPeerDescriptor(), PeerDescriptor)
        const key = createRandomKademliaId()
        await dhtNode1.storeDataToDht(key, data)

        const foundData = await remote.findDataViaPeer(key, dhtNode1.getLocalPeerDescriptor())
        expect(Any.unpack(foundData[0].data!, PeerDescriptor)).toEqual(dhtNode1.getLocalPeerDescriptor())
    })
    
    it('findData returns empty array if no data found', async () => {
        const foundData = await remote.findDataViaPeer(createRandomKademliaId(), dhtNode1.getLocalPeerDescriptor())
        expect(foundData).toEqual([])
    })

    it('external store data happy path', async () => {
        const storedPeerDescriptor = createMockPeerDescriptor()
        const data = Any.pack(storedPeerDescriptor, PeerDescriptor)
        const key = createRandomKademliaId()

        await remote.storeDataViaPeer(key, data, dhtNode1.getLocalPeerDescriptor())
        const foundData = await remote.findDataViaPeer(key, dhtNode1.getLocalPeerDescriptor())
        expect(areEqualPeerDescriptors(Any.unpack(foundData[0].data!, PeerDescriptor), storedPeerDescriptor)).toEqual(true)
        expect(areEqualPeerDescriptors(foundData[0].creator!, remote.getLocalPeerDescriptor())).toEqual(true)
    })
  
})
