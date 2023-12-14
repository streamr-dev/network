import { createMockConnectionDhtNode } from '../utils/utils'
import { DhtNode } from '../../src/dht/DhtNode'
import { Simulator } from '../../src/connection/simulator/Simulator'
import { waitForCondition } from '@streamr/utils'
import { createMockDataEntry, expectEqualData } from '../utils/mock/mockDataEntry'

describe('Storing data in DHT with two peers', () => {

    let entryPoint: DhtNode
    let otherNode: DhtNode
    let simulator: Simulator | undefined

    beforeEach(async () => {
        simulator = new Simulator()
        entryPoint = await createMockConnectionDhtNode(simulator)
        otherNode = await createMockConnectionDhtNode(simulator)

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
        const storedData1 = createMockDataEntry()
        const storedData2 = createMockDataEntry()
        await otherNode.storeDataToDht(storedData1.key, storedData1.data!)
        await entryPoint.storeDataToDht(storedData2.key, storedData2.data!)
        const foundData1 = await otherNode.getDataFromDht(storedData1.key)
        const foundData2 = await entryPoint.getDataFromDht(storedData2.key)
        expectEqualData(foundData1[0], storedData1)
        expectEqualData(foundData2[0], storedData2)
    })

    it('Can store on one peer DHT', async () => {
        await otherNode.stop()
        await waitForCondition(() => entryPoint.getNumberOfNeighbors() === 0)
        const storedData = createMockDataEntry()
        await entryPoint.storeDataToDht(storedData.key, storedData.data!)
        const foundData = await entryPoint.getDataFromDht(storedData.key)
        expectEqualData(foundData[0], storedData)
    }, 60000)
})
