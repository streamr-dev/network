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
import { RandomGraphNode } from '../../src/logic/RandomGraphNode'
import {
    ContentType,
    EncryptionType,
    MessageID,
    SignatureType,
    StreamMessage
} from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { ContentDeliveryRpcRemote } from '../../src/logic/ContentDeliveryRpcRemote'
import { createRandomGraphNode } from '../../src/logic/createRandomGraphNode'
import { HandshakeRpcRemote } from '../../src/logic/neighbor-discovery/HandshakeRpcRemote'
import { NetworkNode, createNetworkNode } from '../../src/NetworkNode'
import { EthereumAddress, hexToBinary, utf8ToBinary } from '@streamr/utils'
import { StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import { Layer1Node } from '../../src/logic/Layer1Node'
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

export const createMockRandomGraphNodeAndDhtNode = async (
    localPeerDescriptor: PeerDescriptor,
    entryPointDescriptor: PeerDescriptor,
    streamPartId: StreamPartID,
    simulator: Simulator
): Promise<[ Layer1Node, RandomGraphNode ]> => {
    const mockCm = new SimulatorTransport(localPeerDescriptor, simulator)
    await mockCm.start()
    const layer1Node = new DhtNode({
        transport: mockCm,
        peerDescriptor: localPeerDescriptor,
        numberOfNodesPerKBucket: 4,
        entryPoints: [entryPointDescriptor],
        rpcRequestTimeout: 5000
    })
    const randomGraphNode = createRandomGraphNode({
        streamPartId,
        transport: mockCm,
        layer1Node,
        connectionLocker: mockCm,
        localPeerDescriptor,
        rpcRequestTimeout: 5000,
        isLocalNodeEntryPoint: () => false
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
            maxConnections: 25,
            storeHighestTtl: 120000,
            storeMaxTtl: 120000
        }
    })
}
