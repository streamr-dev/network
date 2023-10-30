import { randomBytes } from 'crypto'
import { ConnectionLocker, DhtNode, NodeType, PeerDescriptor, Simulator, SimulatorTransport } from '@streamr/dht'
import { RandomGraphNode } from '../../src/logic/RandomGraphNode'
import {
    ContentType,
    EncryptionType,
    MessageID,
    StreamMessage,
    StreamMessageType
} from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { DeliveryRpcRemote } from '../../src/logic/DeliveryRpcRemote'
import { createRandomGraphNode } from '../../src/logic/createRandomGraphNode'
import { HandshakeRpcRemote } from '../../src/logic/neighbor-discovery/HandshakeRpcRemote'
import { NetworkNode, createNetworkNode } from '../../src/NetworkNode'
import { EthereumAddress, hexToBinary, utf8ToBinary } from '@streamr/utils'
import { StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import { NodeID } from '../../src/identifiers'
import { Layer1Node } from '../../src/logic/Layer1Node'

export const mockConnectionLocker: ConnectionLocker = {
    lockConnection: () => {},
    unlockConnection: () => {},
    weakLockConnection: () => {},
    weakUnlockConnection: () => {}
}

export const createMockRandomGraphNodeAndDhtNode = async (
    ownPeerDescriptor: PeerDescriptor,
    entryPointDescriptor: PeerDescriptor,
    streamPartId: StreamPartID,
    simulator: Simulator
): Promise<[ Layer1Node, RandomGraphNode ]> => {
    const mockCm = new SimulatorTransport(ownPeerDescriptor, simulator)
    await mockCm.start()
    const layer1Node = new DhtNode({
        transportLayer: mockCm,
        peerDescriptor: ownPeerDescriptor,
        numberOfNodesPerKBucket: 4,
        entryPoints: [entryPointDescriptor]
    })
    const randomGraphNode = createRandomGraphNode({
        streamPartId,
        P2PTransport: mockCm,
        layer1Node,
        connectionLocker: mockCm,
        ownPeerDescriptor
    })
    return [layer1Node, randomGraphNode]
}

export const createStreamMessage = (
    content: string,
    streamPartId: StreamPartID,
    publisherId: EthereumAddress,
    timestamp?: number,
    sequenceNumber?: number
): StreamMessage => {
    const messageId: MessageID = {
        streamId: StreamPartIDUtils.getStreamID(streamPartId),
        streamPartition: StreamPartIDUtils.getStreamPartition(streamPartId),
        sequenceNumber: sequenceNumber || 0,
        timestamp: timestamp || Date.now(),
        publisherId: hexToBinary(publisherId),
        messageChainId: 'messageChain0',
    }
    const msg: StreamMessage = {
        messageType: StreamMessageType.MESSAGE,
        encryptionType: EncryptionType.NONE,
        content: utf8ToBinary(content),
        contentType: ContentType.JSON,
        messageId,
        signature: hexToBinary('0x1234')
    }
    return msg
}

export const createRandomNodeId = (): NodeID => {
    return randomBytes(10).toString('hex') as NodeID
}

export const createMockPeerDescriptor = (opts?: Omit<Partial<PeerDescriptor>, 'kademliaId' | 'type'>): PeerDescriptor => {
    return {
        ...opts,
        kademliaId: hexToBinary(createRandomNodeId()),
        type: NodeType.NODEJS
    }
}

export const createMockDeliveryRpcRemote = (remotePeerDescriptor?: PeerDescriptor): DeliveryRpcRemote => {
    return new DeliveryRpcRemote(createMockPeerDescriptor(), remotePeerDescriptor || createMockPeerDescriptor(), 'mock', {} as any)
}

export const createMockHandshakeRpcRemote = (): HandshakeRpcRemote => {
    return new HandshakeRpcRemote(
        createMockPeerDescriptor(),
        createMockPeerDescriptor(), 
        'mock',
        {
            handshake: async () => {},
            interleaveNotice: async () => {}
        } as any
    )
}

export const createNetworkNodeWithSimulator = (
    peerDescriptor: PeerDescriptor,
    simulator: Simulator,
    entryPoints: PeerDescriptor[]
): NetworkNode => {
    const transport = new SimulatorTransport(peerDescriptor, simulator)
    return createNetworkNode({
        layer0: {
            peerDescriptor,
            entryPoints,
            transportLayer: transport,
            maxConnections: 25,
            storeHighestTtl: 120000,
            storeMaxTtl: 120000
        }
    })
}
