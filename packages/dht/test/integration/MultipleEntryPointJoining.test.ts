import { LatencyType, Simulator } from '../../src/connection/simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
import { createMockConnectionDhtNode } from '../utils/utils'

describe('multiple entry point joining', () => {
    describe('all nodes are entry points', () => {
        let simulator: Simulator
        let node1: DhtNode
        let node2: DhtNode
        let node3: DhtNode
        let entryPoints: PeerDescriptor[]

        beforeEach(async () => {
            simulator = new Simulator(LatencyType.REAL)

            node1 = await createMockConnectionDhtNode(simulator)
            node2 = await createMockConnectionDhtNode(simulator)
            node3 = await createMockConnectionDhtNode(simulator)

            entryPoints = [
                node1.getLocalPeerDescriptor(),
                node2.getLocalPeerDescriptor(),
                node3.getLocalPeerDescriptor()
            ]
        })

        afterEach(async () => {
            await Promise.all([node1.stop(), node2.stop(), node3.stop()])
            simulator.stop()
        })

        it('can join simultaneously', async () => {
            await Promise.all([node1.joinDht(entryPoints), node2.joinDht(entryPoints), node3.joinDht(entryPoints)])
            expect(node1.getNeighborCount()).toEqual(2)
            expect(node2.getNeighborCount()).toEqual(2)
            expect(node3.getNeighborCount()).toEqual(2)
        })

        it('can join even if a node is offline', async () => {
            await node3.stop()
            await Promise.all([node1.joinDht(entryPoints), node2.joinDht(entryPoints)])
            expect(node1.getNeighborCount()).toEqual(1)
            expect(node2.getNeighborCount()).toEqual(1)
        }, 10000)
    })

    describe('non entry point nodes can join via multiple entry points', () => {
        let simulator: Simulator
        let entryPoint1: DhtNode
        let entryPoint2: DhtNode
        let node1: DhtNode
        let node2: DhtNode
        let entryPoints: PeerDescriptor[]

        beforeEach(async () => {
            simulator = new Simulator(LatencyType.REAL)

            entryPoint1 = await createMockConnectionDhtNode(simulator)
            entryPoint2 = await createMockConnectionDhtNode(simulator)

            node1 = await createMockConnectionDhtNode(simulator)
            node2 = await createMockConnectionDhtNode(simulator)

            entryPoints = [entryPoint1.getLocalPeerDescriptor(), entryPoint2.getLocalPeerDescriptor()]

            await entryPoint1.joinDht(entryPoints)
            await entryPoint2.joinDht(entryPoints)
        })

        afterEach(async () => {
            await Promise.all([entryPoint1.stop(), entryPoint2.stop(), node1.stop(), node2.stop()])
            simulator.stop()
        })

        it('non-entry point nodes can join', async () => {
            await node1.joinDht(entryPoints)
            expect(node1.getNeighborCount()).toEqual(2)
            await node2.joinDht(entryPoints)
            expect(node2.getNeighborCount()).toEqual(3)
        })
    })
})
