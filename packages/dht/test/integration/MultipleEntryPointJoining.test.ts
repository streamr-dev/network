import { getTestInterface } from '@streamr/test-utils'
import { LatencyType, Simulator } from '../../src/connection/simulator/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockConnectionDhtNode } from '../utils/utils'

describe('multiple entry point joining', () => {

    describe('all nodes are entry points', () => {

        let simulator: Simulator
        let node1: DhtNode
        let node2: DhtNode
        let node3: DhtNode
        let entryPoints: PeerDescriptor[]
        
        beforeEach(async () => {
            simulator = new Simulator(LatencyType.RANDOM)

            node1 = await createMockConnectionDhtNode('node1', simulator)
            node2 = await createMockConnectionDhtNode('node2', simulator)
            node3 = await createMockConnectionDhtNode('node3', simulator)

            entryPoints = [
                node1.getLocalPeerDescriptor(),
                node2.getLocalPeerDescriptor(),
                node3.getLocalPeerDescriptor()
            ]
        })

        afterEach(async () => {
            await Promise.all([
                node1.stop(),
                node2.stop(),
                node3.stop()
            ])
            simulator.stop()
        })

        it('can join simultaneously', async () => {
            await Promise.all([
                node1.joinDht(entryPoints),
                node2.joinDht(entryPoints),
                node3.joinDht(entryPoints)
            ])
            expect(getTestInterface(getTestInterface(node1).getPeerManager()).getKBucketSize()).toEqual(2)
            expect(getTestInterface(getTestInterface(node2).getPeerManager()).getKBucketSize()).toEqual(2)
            expect(getTestInterface(getTestInterface(node3).getPeerManager()).getKBucketSize()).toEqual(2)
        })

        it('can join even if a node is offline', async () => {
            await node3.stop()
            await Promise.all([
                node1.joinDht(entryPoints),
                node2.joinDht(entryPoints)
            ])
            expect(getTestInterface(getTestInterface(node1).getPeerManager()).getKBucketSize()).toEqual(1)
            expect(getTestInterface(getTestInterface(node2).getPeerManager()).getKBucketSize()).toEqual(1)
        }, 20000)
    })

    describe('non entry point nodes can join via multiple entry points', () => {
        let simulator: Simulator
        let entryPoint1: DhtNode
        let entryPoint2: DhtNode
        let node1: DhtNode
        let node2: DhtNode
        let entryPoints: PeerDescriptor[]
        
        beforeEach(async () => {
            simulator = new Simulator(LatencyType.RANDOM)
            
            entryPoint1 = await createMockConnectionDhtNode('entryPoint1', simulator)
            entryPoint2 = await createMockConnectionDhtNode('entryPoint2', simulator)
            
            node1 = await createMockConnectionDhtNode('node1', simulator)
            node2 = await createMockConnectionDhtNode('node2', simulator)

            entryPoints = [
                entryPoint1.getLocalPeerDescriptor(),
                entryPoint2.getLocalPeerDescriptor(),
            ]

            await entryPoint1.joinDht(entryPoints)
            await entryPoint2.joinDht(entryPoints)
        })

        afterEach(async () => {
            await Promise.all([
                entryPoint1.stop(),
                entryPoint2.stop(),
                node1.stop(),
                node2.stop()
            ])
            simulator.stop()
        })

        it('non-entry point nodes can join', async () => {
            await node1.joinDht(entryPoints)
            expect(getTestInterface(getTestInterface(node1).getPeerManager()).getKBucketSize()).toEqual(2)
            await node2.joinDht(entryPoints)
            expect(getTestInterface(getTestInterface(node2).getPeerManager()).getKBucketSize()).toEqual(3)
        })

    })
})
