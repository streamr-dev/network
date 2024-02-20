import { LatencyType, Simulator } from '../../src/connection/simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { createRandomDhtAddress, getDhtAddressFromRaw, getNodeIdFromPeerDescriptor } from '../../src/identifiers'
import { createMockDataEntry, expectEqualData } from '../utils/mock/mockDataEntry'
import { createMockConnectionDhtNode } from '../utils/utils'

describe('DhtNodeExternalApi', () => {

    let simulator: Simulator
    let dhtNode1: DhtNode
    let remote: DhtNode

    beforeEach(async () => {
        simulator = new Simulator(LatencyType.NONE)
        dhtNode1 = await createMockConnectionDhtNode(simulator)
        remote = await createMockConnectionDhtNode(simulator)
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
        const entry = createMockDataEntry()
        await dhtNode1.storeDataToDht(getDhtAddressFromRaw(entry.key), entry.data!)
        const foundData = await remote.fetchDataFromDhtViaPeer(getDhtAddressFromRaw(entry.key), dhtNode1.getLocalPeerDescriptor())
        expectEqualData(foundData[0], entry)
    })
    
    it('findData returns empty array if no data found', async () => {
        const foundData = await remote.fetchDataFromDhtViaPeer(createRandomDhtAddress(), dhtNode1.getLocalPeerDescriptor())
        expect(foundData).toEqual([])
    })

    it('external store data happy path', async () => {
        const entry = createMockDataEntry()
        await remote.storeDataToDhtViaPeer(getDhtAddressFromRaw(entry.key), entry.data!, dhtNode1.getLocalPeerDescriptor())
        const foundData = await remote.fetchDataFromDhtViaPeer(getDhtAddressFromRaw(entry.key), dhtNode1.getLocalPeerDescriptor())
        expectEqualData(foundData[0], entry)
        expect(getDhtAddressFromRaw(foundData[0].creator)).toEqual(getNodeIdFromPeerDescriptor(remote.getLocalPeerDescriptor()))
    })
  
})
