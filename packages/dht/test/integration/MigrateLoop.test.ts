import { LatencyType, Simulator } from "../../src/connection/Simulator/Simulator"
import { DhtNode } from "../../src/dht/DhtNode"
import { PeerDescriptor } from "../../src/exports"
import { Any } from "../../src/proto/google/protobuf/any"
import { createMockConnectionDhtNode } from "../utils/utils"
import { PeerID } from '../../src/helpers/PeerID'
import { wait } from '@streamr/utils'

describe('migration', () => {

    let node1: DhtNode
    let node2: DhtNode
    let node3: DhtNode

    let newNode1: DhtNode
    let newNode2: DhtNode
    let newNode3: DhtNode

    let simulator: Simulator

    beforeEach(async () => {
        simulator = new Simulator(LatencyType.FIXED, 5)
    
        node1 = await createMockConnectionDhtNode('node1', simulator)
        node2 = await createMockConnectionDhtNode('node2', simulator)
        node3 = await createMockConnectionDhtNode('node3', simulator)

        newNode1 = await createMockConnectionDhtNode('key1', simulator)
        newNode2 = await createMockConnectionDhtNode('store1', simulator)
        newNode3 = await createMockConnectionDhtNode('dsaasd', simulator)

        await node1.start()
        await node2.start()
        await node3.start()

        node1.joinDht(node1.getPeerDescriptor())
        node2.joinDht(node2.getPeerDescriptor())
        node1.joinDht(node3.getPeerDescriptor())

    })

    afterEach(async () => {
        await Promise.all([
            node1.stop(),
            node2.stop(),
            node3.stop()
        ])

        simulator.stop()
    })

    it('does not loop', async () => {
        await node1.storeDataToDht(PeerID.fromString('key1').value, Any.pack(node1.getPeerDescriptor(), PeerDescriptor))
        
        await newNode1.start()
        await newNode1.joinDht(node1.getPeerDescriptor())

        await newNode1.storeDataToDht(PeerID.fromString('store1').value, Any.pack(node1.getPeerDescriptor(), PeerDescriptor))
        await newNode1.stop()

        await newNode2.start()
        await newNode2.joinDht(node1.getPeerDescriptor())
        await Promise.all([
            newNode2.storeDataToDht(PeerID.fromString('dsaasd').value, Any.pack(node1.getPeerDescriptor(), PeerDescriptor)),
            node1.storeDataToDht(PeerID.fromString('dsaasd').value, Any.pack(node1.getPeerDescriptor(), PeerDescriptor)),
            node2.storeDataToDht(PeerID.fromString('dsaasd').value, Any.pack(node1.getPeerDescriptor(), PeerDescriptor)),
            node3.storeDataToDht(PeerID.fromString('dsaasd').value, Any.pack(node1.getPeerDescriptor(), PeerDescriptor))
        ])
        await newNode2.stop()

        await newNode3.start()
        await newNode3.joinDht(node1.getPeerDescriptor())

        await wait(30000)
        await newNode3.stop()
        
    }, 60000)
})