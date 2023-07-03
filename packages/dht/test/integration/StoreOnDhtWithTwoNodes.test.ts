import { createMockConnectionDhtNode } from '../utils/utils'
import { DhtNode } from '../../src/dht/DhtNode'
import { Simulator } from '../../src/connection/Simulator/Simulator'
import { PeerID } from '../../src/helpers/PeerID'
import { Any } from '../../src/proto/google/protobuf/any'
import { PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { isSamePeerDescriptor } from '../../src/helpers/peerIdFromPeerDescriptor'
import { waitForCondition } from '@streamr/utils'

describe('Storing data in DHT with two peers', () => {

    let entryPoint: DhtNode
    let otherNode: DhtNode

    let simulator: Simulator | undefined

    beforeEach(async () => {
        simulator = new Simulator()
        const entryPointId = 'node0'
        const otherNodeId = 'other-node'
        entryPoint = await createMockConnectionDhtNode(
            entryPointId,
            simulator,
        )
        otherNode = await createMockConnectionDhtNode(
            otherNodeId,
            simulator
        )

        await entryPoint.start()
        await otherNode.start()

        await entryPoint.joinDht(entryPoint.getPeerDescriptor())
        await otherNode.joinDht(entryPoint.getPeerDescriptor())
    })

    afterEach(async () => {
        await entryPoint.stop()
        await otherNode.stop()
        simulator?.stop()
    })

    it('Node can store on two peer DHT', async () => {
        const dataKey1 = PeerID.fromString('node0-stored-data')
        const data1 = Any.pack(otherNode.getPeerDescriptor(), PeerDescriptor)
        const dataKey2 = PeerID.fromString('other-node-stored-data')
        const data2 = Any.pack(entryPoint.getPeerDescriptor(), PeerDescriptor)

        const successfulStorers1 = await otherNode.storeDataToDht(dataKey1.value, data1)
        const successfulStorers2 = await entryPoint.storeDataToDht(dataKey2.value, data2)
        expect(successfulStorers1[0].nodeName).toEqual(entryPoint.getPeerDescriptor().nodeName)
        expect(successfulStorers2[0].nodeName).toEqual(otherNode.getPeerDescriptor().nodeName)

        const foundData1 = await otherNode.getDataFromDht(dataKey1.value)
        const foundData2 = await entryPoint.getDataFromDht(dataKey2.value)
        expect(isSamePeerDescriptor(otherNode.getPeerDescriptor(), Any.unpack(foundData1.dataEntries![0]!.data!, PeerDescriptor))).toBeTrue()
        expect(isSamePeerDescriptor(entryPoint.getPeerDescriptor(), Any.unpack(foundData2.dataEntries![0]!.data!, PeerDescriptor))).toBeTrue()
    })

    it('Can store on one peer DHT', async () => {
        await otherNode.stop()
        await waitForCondition(() => entryPoint.getBucketSize() === 0)
        const dataKey = PeerID.fromString('data-to-store')
        const data = Any.pack(entryPoint.getPeerDescriptor(), PeerDescriptor)
        const successfulStorers = await entryPoint.storeDataToDht(dataKey.value, data)
        expect(successfulStorers[0].nodeName).toEqual(entryPoint.getPeerDescriptor().nodeName)

        const foundData = await entryPoint.getDataFromDht(dataKey.value)
        expect(isSamePeerDescriptor(entryPoint.getPeerDescriptor(), Any.unpack(foundData.dataEntries![0]!.data!, PeerDescriptor))).toBeTrue()
    }, 60000)
})
