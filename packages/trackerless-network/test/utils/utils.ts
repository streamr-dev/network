import { ConnectionLocker, DhtNode, PeerDescriptor, PeerID, Simulator, SimulatorTransport, UUID } from '@streamr/dht'
import { RandomGraphNode } from '../../src/logic/RandomGraphNode'
import {
    ContentMessage,
    MessageRef,
    StreamMessage,
    StreamMessageType
} from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { RemoteRandomGraphNode } from '../../src/logic/RemoteRandomGraphNode'
import { createRandomGraphNode } from '../../src/logic/createRandomGraphNode'
import { RemoteHandshaker } from '../../src/logic/neighbor-discovery/RemoteHandshaker'
import { NetworkNode } from '../../src/NetworkNode'

export const mockConnectionLocker: ConnectionLocker = {
    lockConnection: () => {},
    unlockConnection: () => {},
    weakLockConnection: () => {},
    weakUnlockConnection: () => {}
}

export const createMockRandomGraphNodeAndDhtNode = (
    ownPeerDescriptor: PeerDescriptor,
    entryPointDescriptor: PeerDescriptor,
    randomGraphId: string,
    simulator: Simulator
): [ DhtNode, RandomGraphNode ] => {
    const mockCm = new SimulatorTransport(ownPeerDescriptor, simulator)
    const dhtNode = new DhtNode({
        transportLayer: mockCm,
        peerDescriptor: ownPeerDescriptor,
        numberOfNodesPerKBucket: 4,
        entryPoints: [entryPointDescriptor]
    })
    const randomGraphNode = createRandomGraphNode({
        randomGraphId,
        P2PTransport: mockCm,
        layer1: dhtNode,
        connectionLocker: mockCm,
        ownPeerDescriptor
    })
    return [dhtNode, randomGraphNode]
}

export const createStreamMessage = (content: ContentMessage, streamId: string, publisherId: string): StreamMessage => {
    const messageRef: MessageRef = {
        streamId,
        messageChainId: 'messageChain0',
        streamPartition: 0,
        sequenceNumber: 0,
        timestamp: Date.now(),
        publisherId

    }
    const msg: StreamMessage = {
        messageType: StreamMessageType.MESSAGE,
        content: ContentMessage.toBinary(content),
        messageRef,
        signature: 'signature'
    }
    return msg
}

export const createMockRemotePeer = (): RemoteRandomGraphNode => {
    const mockPeer: PeerDescriptor = {
        kademliaId: PeerID.fromString(new UUID().toString()).value,
        type: 0
    }
    return new RemoteRandomGraphNode(mockPeer, 'mock', {} as any)
}

export const createMockRemoteHandshaker = (): RemoteHandshaker => {
    const mockPeer: PeerDescriptor = {
        kademliaId: PeerID.fromString(new UUID().toString()).value,
        type: 0
    }
    return new RemoteHandshaker(mockPeer, 'mock', {
        handshake: async () => {},
        interleaveNotice: async () => {}
    } as any)
}

export const createNetworkNodeWithSimulator = (
    peerDescriptor: PeerDescriptor,
    simulator: Simulator,
    entryPoints: PeerDescriptor[]
): NetworkNode => {
    const transport = new SimulatorTransport(peerDescriptor, simulator)
    return new NetworkNode({
        layer0: {
            peerDescriptor,
            entryPoints,
            transportLayer: transport,
            maxConnections: 25,
            storeHighestTtl: 120000,
            storeMaxTtl: 120000
        },
        networkNode: {}
    })
}
