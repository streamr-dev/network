import { DhtNode } from "../../src/dht/DhtNode"
import { LatencyType, Simulator } from "../../src/connection/Simulator/Simulator"
import { createMockConnectionDhtNode } from "../utils/utils"
import { Any } from "../../src/proto/google/protobuf/any"
import { PeerDescriptor } from "../../src/proto/packages/dht/protos/DhtRpc"
import { PeerID } from "../../src/helpers/PeerID"

describe('DhtNodeExternalApi', () => {

    let simulator: Simulator
    let dhtNode1: DhtNode
    let remote: DhtNode

    beforeEach(async () => {
        simulator = new Simulator(LatencyType.NONE)
        dhtNode1 = await createMockConnectionDhtNode('node1', simulator)
        remote = await createMockConnectionDhtNode('remote', simulator)
        await dhtNode1.joinDht(dhtNode1.getPeerDescriptor())
    })

    afterEach(async () => {
        await Promise.all([
            dhtNode1.stop(),
            remote.stop()
        ])
        simulator.stop()
    })

    it('findData happy path', async () => {
        const data = Any.pack(dhtNode1.getPeerDescriptor(), PeerDescriptor)
        const key = PeerID.fromString('key').value
        await dhtNode1.storeDataToDht(key, data)

        const foundData = await remote.findDataViaPeer(key, dhtNode1.getPeerDescriptor())
        expect(Any.unpack(foundData[0].data!, PeerDescriptor)).toEqual(dhtNode1.getPeerDescriptor())
    })
    
    it('findData returns empty array if no data found', async () => {
        const foundData = await remote.findDataViaPeer(PeerID.fromString('key').value, dhtNode1.getPeerDescriptor())
        expect(foundData).toEqual([])
    })
  
})
