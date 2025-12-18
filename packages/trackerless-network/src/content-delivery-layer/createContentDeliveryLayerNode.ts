import { DhtAddress, ListeningRpcCommunicator, toNodeId } from '@streamr/dht'
import { Handshaker } from './neighbor-discovery/Handshaker'
import { NeighborFinder } from './neighbor-discovery/NeighborFinder'
import { DEFAULT_NEIGHBOR_UPDATE_INTERVAL, NeighborUpdateManager } from './neighbor-discovery/NeighborUpdateManager'
import { 
    StrictContentDeliveryLayerNodeOptions,
    ContentDeliveryLayerNode,
    DEFAULT_NODE_VIEW_SIZE,
    DEFAULT_ACCEPT_PROXY_CONNECTIONS,
    DEFAULT_NEIGHBOR_TARGET_COUNT
} from './ContentDeliveryLayerNode'
import { NodeList } from './NodeList'
import {
    DEFAULT_MIN_PROPAGATION_TARGETS,
    DEFAULT_MAX_PROPAGATION_BUFFER_SIZE,
    DEFAULT_PROPAGATION_BUFFER_TTL,
    Propagation
} from './propagation/Propagation'
import { StreamMessage } from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import type { MarkOptional } from 'ts-essentials'
import { ProxyConnectionRpcLocal } from './proxy/ProxyConnectionRpcLocal'
import { Inspector } from './inspection/Inspector'
import { TemporaryConnectionRpcLocal } from './temporary-connection/TemporaryConnectionRpcLocal'
import { formStreamPartContentDeliveryServiceId } from './formStreamPartDeliveryServiceId'
import { PlumtreeManager } from './plumtree/PlumtreeManager'

type ContentDeliveryLayerNodeOptions = MarkOptional<StrictContentDeliveryLayerNodeOptions,
    'nearbyNodeView' | 'randomNodeView' | 'neighbors' | 'leftNodeView' | 'rightNodeView' | 'propagation'
    | 'handshaker' | 'neighborFinder' | 'neighborUpdateManager' | 'neighborTargetCount'
    | 'rpcCommunicator' | 'nodeViewSize'
    | 'inspector' | 'temporaryConnectionRpcLocal'> & {
        maxContactCount?: number
        minPropagationTargets?: number
        acceptProxyConnections?: boolean
        neighborUpdateInterval?: number
        maxPropagationBufferSize?: number
        bufferWhileConnecting?: boolean
        plumtreeOptimization?: boolean
        plumtreeMaxPausedNeighbors?: number
    }

const createConfigWithDefaults = (options: ContentDeliveryLayerNodeOptions): StrictContentDeliveryLayerNodeOptions => {
    const ownNodeId = toNodeId(options.localPeerDescriptor)
    const rpcCommunicator = options.rpcCommunicator ?? new ListeningRpcCommunicator(
        formStreamPartContentDeliveryServiceId(options.streamPartId),
        options.transport
    )
    const neighborTargetCount = options.neighborTargetCount ?? DEFAULT_NEIGHBOR_TARGET_COUNT
    const maxContactCount = options.maxContactCount ?? DEFAULT_NODE_VIEW_SIZE
    const acceptProxyConnections = options.acceptProxyConnections ?? DEFAULT_ACCEPT_PROXY_CONNECTIONS
    const neighborUpdateInterval = options.neighborUpdateInterval ?? DEFAULT_NEIGHBOR_UPDATE_INTERVAL
    const minPropagationTargets = options.minPropagationTargets ?? DEFAULT_MIN_PROPAGATION_TARGETS
    const maxPropagationBufferSize = options.maxPropagationBufferSize ?? DEFAULT_MAX_PROPAGATION_BUFFER_SIZE
    const neighbors = options.neighbors ?? new NodeList(ownNodeId, maxContactCount)
    const leftNodeView = options.leftNodeView ?? new NodeList(ownNodeId, maxContactCount)
    const rightNodeView = options.rightNodeView ?? new NodeList(ownNodeId, maxContactCount)
    const nearbyNodeView = options.nearbyNodeView ?? new NodeList(ownNodeId, maxContactCount)
    const randomNodeView = options.randomNodeView ?? new NodeList(ownNodeId, maxContactCount)
    const ongoingHandshakes = new Set<DhtAddress>()

    const temporaryConnectionRpcLocal = new TemporaryConnectionRpcLocal({
        rpcCommunicator,
        localPeerDescriptor: options.localPeerDescriptor,
        streamPartId: options.streamPartId,
        connectionLocker: options.connectionLocker
    })
    const proxyConnectionRpcLocal = acceptProxyConnections ? new ProxyConnectionRpcLocal({
        localPeerDescriptor: options.localPeerDescriptor,
        streamPartId: options.streamPartId,
        rpcCommunicator
    }) : undefined
    const plumtreeManager = options.plumtreeOptimization ? new PlumtreeManager({
        neighbors,
        localPeerDescriptor: options.localPeerDescriptor,
        rpcCommunicator,
        maxPausedNeighbors: options.plumtreeMaxPausedNeighbors
    }) : undefined
    const propagation = options.propagation ?? new Propagation({
        minPropagationTargets,
        maxMessages: maxPropagationBufferSize,
        ttl: DEFAULT_PROPAGATION_BUFFER_TTL,
        sendToNeighbor: async (neighborId: DhtAddress, msg: StreamMessage): Promise<void> => {
            const remote = neighbors.get(neighborId) ?? temporaryConnectionRpcLocal.getNodes().get(neighborId)
            const proxyConnection = proxyConnectionRpcLocal?.getConnection(neighborId)
            if (remote) {
                await remote.sendStreamMessage(msg, options.bufferWhileConnecting)
            } else if (proxyConnection) {
                await proxyConnection.remote.sendStreamMessage(msg)
            } else {
                throw new Error('Propagation target not found')
            }
        }
    })
    const handshaker = options.handshaker ?? new Handshaker({
        localPeerDescriptor: options.localPeerDescriptor,
        streamPartId: options.streamPartId,
        rpcCommunicator,
        neighbors,
        leftNodeView,
        rightNodeView,
        nearbyNodeView,
        randomNodeView,
        maxNeighborCount: neighborTargetCount,
        rpcRequestTimeout: options.rpcRequestTimeout,
        ongoingHandshakes
    })
    const neighborFinder = options.neighborFinder ?? new NeighborFinder({
        neighbors,
        leftNodeView,
        rightNodeView,
        nearbyNodeView,
        randomNodeView,
        doFindNeighbors: (excludedIds) => handshaker.attemptHandshakesOnContacts(excludedIds),
        minCount: neighborTargetCount
    })
    const neighborUpdateManager = options.neighborUpdateManager ?? new NeighborUpdateManager({
        neighbors,
        nearbyNodeView,
        localPeerDescriptor: options.localPeerDescriptor,
        neighborFinder,
        streamPartId: options.streamPartId,
        rpcCommunicator,
        neighborUpdateInterval,
        neighborTargetCount,
        ongoingHandshakes
    })
    const inspector = options.inspector ?? new Inspector({
        localPeerDescriptor: options.localPeerDescriptor,
        rpcCommunicator,
        streamPartId: options.streamPartId,
        connectionLocker: options.connectionLocker
    })
    return {
        ...options,
        neighbors,
        leftNodeView,
        rightNodeView,
        nearbyNodeView,
        randomNodeView,
        rpcCommunicator,
        handshaker,
        neighborFinder,
        neighborUpdateManager,
        propagation,
        neighborTargetCount,
        nodeViewSize: maxContactCount,
        proxyConnectionRpcLocal,
        inspector,
        temporaryConnectionRpcLocal,
        plumtreeManager
    }
}

export const createContentDeliveryLayerNode = (options: ContentDeliveryLayerNodeOptions): ContentDeliveryLayerNode => {
    return new ContentDeliveryLayerNode(createConfigWithDefaults(options))
}
