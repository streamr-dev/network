import { ConnectionLocker, DhtNode, PeerDescriptor, Simulator, SimulatorTransport } from '@streamr/dht'
import { RandomGraphNode } from '../src/logic/RandomGraphNode'
import {
    ContentMessage,
    MessageRef,
    StreamMessage,
    StreamMessageType
} from '../src/proto/packages/trackerless-network/protos/NetworkRpc'

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
        timestamp: BigInt(Date.now()),
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
