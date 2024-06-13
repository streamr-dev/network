import { 
    ConnectionLocker,
    DhtNode,
    NodeType,
    PeerDescriptor,
    Simulator,
    SimulatorTransport,
    createRandomDhtAddress,
    getRandomRegion,
    getRawFromDhtAddress
} from '@streamr/dht'
import { ContentDeliveryLayerNode } from '../../src/logic/ContentDeliveryLayerNode'
import {
    ContentType,
    EncryptionType,
    MessageID,
    SignatureType,
    StreamMessage
} from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { ContentDeliveryRpcRemote } from '../../src/logic/ContentDeliveryRpcRemote'
import { createContentDeliveryLayerNode } from '../../src/logic/createContentDeliveryLayerNode'
import { HandshakeRpcRemote } from '../../src/logic/neighbor-discovery/HandshakeRpcRemote'
import { NetworkNode, createNetworkNode } from '../../src/NetworkNode'
import { EthereumAddress, hexToBinary, utf8ToBinary } from '@streamr/utils'
import { StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import { DiscoveryLayerNode } from '../../src/logic/DiscoveryLayerNode'
import { ContentDeliveryRpcClient, HandshakeRpcClient } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc.client'
import { RpcCommunicator } from '@streamr/proto-rpc'

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
        rpcRequestTimeout: 5000
    })
    const contentDeliveryLayerNode = createContentDeliveryLayerNode({
        streamPartId,
        transport: mockCm,
        discoveryLayerNode,
        connectionLocker: mockCm,
        localPeerDescriptor,
        rpcRequestTimeout: 5000,
        isLocalNodeStored: () => false
    })
    return [discoveryLayerNode, contentDeliveryLayerNode]
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
        sequenceNumber: sequenceNumber ?? 0,
        timestamp: timestamp ?? Date.now(),
        publisherId: hexToBinary(publisherId),
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
        nodeId: getRawFromDhtAddress(createRandomDhtAddress()),
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
