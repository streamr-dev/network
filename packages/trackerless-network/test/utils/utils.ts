import {
    ConnectionLocker,
    DhtNode,
    NodeType,
    PeerDescriptor,
    Simulator,
    SimulatorTransport,
    randomDhtAddress,
    getRandomRegion,
    toDhtAddressRaw
} from '@streamr/dht'
import { RpcCommunicator } from '@streamr/proto-rpc'
import { StreamPartID, StreamPartIDUtils, UserID, hexToBinary, toUserIdRaw, utf8ToBinary } from '@streamr/utils'
import { NetworkNode, createNetworkNode } from '../../src/NetworkNode'
import { ContentDeliveryLayerNode } from '../../src/logic/ContentDeliveryLayerNode'
import { ContentDeliveryRpcRemote } from '../../src/logic/ContentDeliveryRpcRemote'
import { DiscoveryLayerNode } from '../../src/logic/DiscoveryLayerNode'
import { createContentDeliveryLayerNode } from '../../src/logic/createContentDeliveryLayerNode'
import { HandshakeRpcRemote } from '../../src/logic/neighbor-discovery/HandshakeRpcRemote'
import {
    ContentType,
    EncryptionType,
    MessageID,
    SignatureType,
    StreamMessage
} from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import { ContentDeliveryRpcClient, HandshakeRpcClient } from '../../generated/packages/trackerless-network/protos/NetworkRpc.client'

export const mockConnectionLocker: ConnectionLocker = {
    lockConnection: () => {},
    unlockConnection: () => {},
    weakLockConnection: () => {},
    weakUnlockConnection: () => {},
    getLocalLockedConnectionCount: () => 0,
    getRemoteLockedConnectionCount: () => 0,
    getWeakLockedConnectionCount: () => 0,
}

export const createMockContentDeliveryLayerNodeAndDhtNode = async (
    localPeerDescriptor: PeerDescriptor,
    entryPointDescriptor: PeerDescriptor,
    streamPartId: StreamPartID,
    simulator: Simulator
): Promise<[ DiscoveryLayerNode, ContentDeliveryLayerNode ]> => {
    const mockCm = new SimulatorTransport(localPeerDescriptor, simulator)
    await mockCm.start()
    const discoveryLayerNode = new DhtNode({
        transport: mockCm,
        connectionsView: mockCm,
        peerDescriptor: localPeerDescriptor,
        numberOfNodesPerKBucket: 4,
        entryPoints: [entryPointDescriptor],
        rpcRequestTimeout: 5000,
        neighborPingLimit: 12
    })
    const contentDeliveryLayerNode = createContentDeliveryLayerNode({
        streamPartId,
        transport: mockCm,
        discoveryLayerNode,
        connectionLocker: mockCm,
        localPeerDescriptor,
        rpcRequestTimeout: 5000,
        isLocalNodeEntryPoint: () => false
    })
    return [discoveryLayerNode, contentDeliveryLayerNode]
}

export const createStreamMessage = (
    content: string,
    streamPartId: StreamPartID,
    publisherId: UserID,
    timestamp?: number,
    sequenceNumber?: number
): StreamMessage => {
    const messageId: MessageID = {
        streamId: StreamPartIDUtils.getStreamID(streamPartId),
        streamPartition: StreamPartIDUtils.getStreamPartition(streamPartId),
        sequenceNumber: sequenceNumber ?? 0,
        timestamp: timestamp ?? Date.now(),
        publisherId: toUserIdRaw(publisherId),
        messageChainId: 'messageChain0',
    }
    const msg: StreamMessage = {
        messageId,
        signatureType: SignatureType.SECP256K1,
        signature: hexToBinary('0x1234'),
        body: {
            oneofKind: 'contentMessage',
            contentMessage: {
                encryptionType: EncryptionType.NONE,
                contentType: ContentType.JSON,
                content: utf8ToBinary(content)
            }
        }
    }
    return msg
}

export const createMockPeerDescriptor = (opts?: Omit<Partial<PeerDescriptor>, 'nodeId' | 'type'>): PeerDescriptor => {
    return {
        ...opts,
        nodeId: toDhtAddressRaw(randomDhtAddress()),
        type: NodeType.NODEJS,
        region: getRandomRegion()
    }
}

export const createMockContentDeliveryRpcRemote = (remotePeerDescriptor?: PeerDescriptor): ContentDeliveryRpcRemote => {
    return new ContentDeliveryRpcRemote(
        createMockPeerDescriptor(),
        remotePeerDescriptor ?? createMockPeerDescriptor(),
        new RpcCommunicator(),
        ContentDeliveryRpcClient
    )
}

export const createMockHandshakeRpcRemote = (): HandshakeRpcRemote => {
    return new HandshakeRpcRemote(
        createMockPeerDescriptor(),
        createMockPeerDescriptor(), 
        new RpcCommunicator(),
        HandshakeRpcClient
    )
}

export const createNetworkNodeWithSimulator = async (
    peerDescriptor: PeerDescriptor,
    simulator: Simulator,
    entryPoints: PeerDescriptor[]
): Promise<NetworkNode> => {
    const transport = new SimulatorTransport(peerDescriptor, simulator)
    await transport.start()
    return createNetworkNode({
        layer0: {
            peerDescriptor,
            entryPoints,
            transport,
            connectionsView: transport,
            maxConnections: 25,
            storeHighestTtl: 120000,
            storeMaxTtl: 120000
        }
    })
}
