import { createMockConnectionDhtNode, createMockPeerDescriptor } from '../utils/utils'
import { DhtNode } from '../../src/dht/DhtNode'
import { Simulator } from '../../src/connection/simulator/Simulator'
import { Any } from '../../src/proto/google/protobuf/any'
import { PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { areEqualPeerDescriptors } from '../../src/helpers/peerIdFromPeerDescriptor'
import { waitForCondition } from '@streamr/utils'
import { createRandomNodeId } from '../../src/helpers/nodeId'

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

        await entryPoint.joinDht([entryPoint.getLocalPeerDescriptor()])
        await otherNode.joinDht([entryPoint.getLocalPeerDescriptor()])
    })

    afterEach(async () => {
        await entryPoint.stop()
        await otherNode.stop()
        simulator?.stop()
    })

    it('Node can store on two peer DHT', async () => {
        const storedData1 = createMockPeerDescriptor()
        const storedData2 = createMockPeerDescriptor()
        const dataKey1 = createRandomNodeId()
        const dataKey2 = createRandomNodeId()
        const data1 = Any.pack(storedData1, PeerDescriptor)
        const data2 = Any.pack(storedData2, PeerDescriptor)

        await otherNode.storeDataToDht(dataKey1, data1)
        await entryPoint.storeDataToDht(dataKey2, data2)

        const foundData1 = await otherNode.getDataFromDht(dataKey1)
        const foundData2 = await entryPoint.getDataFromDht(dataKey2)
        expect(areEqualPeerDescriptors(storedData1, Any.unpack(foundData1[0]!.data!, PeerDescriptor))).toBeTrue()
        expect(areEqualPeerDescriptors(storedData2, Any.unpack(foundData2[0]!.data!, PeerDescriptor))).toBeTrue()
    })

    it('Can store on one peer DHT', async () => {
        await otherNode.stop()
        await waitForCondition(() => entryPoint.getNumberOfNeighbors() === 0)
        const dataKey = createRandomNodeId()
        const storedData = createMockPeerDescriptor()
        const data = Any.pack(storedData, PeerDescriptor)
        await entryPoint.storeDataToDht(dataKey, data)

        const foundData = await entryPoint.getDataFromDht(dataKey)
        expect(areEqualPeerDescriptors(storedData, Any.unpack(foundData[0]!.data!, PeerDescriptor))).toBeTrue()
    }, 60000)
})
