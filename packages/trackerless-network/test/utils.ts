import { Simulator, PeerDescriptor, DhtNode, ConnectionLocker, SimulatorTransport } from '@streamr/dht'
import { RandomGraphNode } from '../src/logic/RandomGraphNode'

export const mockConnectionLocker: ConnectionLocker = {
    lockConnection: () => {},
    unlockConnection: () => {}
}

export const createMockRandomGraphNodeAndDhtNode = (
    ownPeerDescriptor: PeerDescriptor,
    entryPointDescriptor: PeerDescriptor,
    randomGraphId: string,
    simulator: Simulator
): [ DhtNode, RandomGraphNode ]  => {
    const mockCm = new SimulatorTransport(ownPeerDescriptor, simulator)
    const dhtNode = new DhtNode({
        transportLayer: mockCm,
        peerDescriptor: ownPeerDescriptor,
        numberOfNodesPerKBucket: 4,
        entryPoints: [entryPointDescriptor]
    })

    const randomGraphNode = new RandomGraphNode({
        randomGraphId,
        P2PTransport: mockCm,
        layer1: dhtNode,
        connectionLocker: mockConnectionLocker
    })
    //simulator.addConnectionManager(mockCm)

    return [dhtNode, randomGraphNode]

}
