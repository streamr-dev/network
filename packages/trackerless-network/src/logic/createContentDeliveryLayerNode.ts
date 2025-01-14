import { DhtAddress, ListeningRpcCommunicator, toNodeId } from '@streamr/dht'
import { Handshaker } from './neighbor-discovery/Handshaker'
import { NeighborFinder } from './neighbor-discovery/NeighborFinder'
import { NeighborUpdateManager } from './neighbor-discovery/NeighborUpdateManager'
import { StrictContentDeliveryLayerNodeOptions, ContentDeliveryLayerNode } from './ContentDeliveryLayerNode'
import { NodeList } from './NodeList'
import { Propagation } from './propagation/Propagation'
import { StreamMessage } from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import type { MarkOptional } from 'ts-essentials'
import { ProxyConnectionRpcLocal } from './proxy/ProxyConnectionRpcLocal'
import { Inspector } from './inspect/Inspector'
import { TemporaryConnectionRpcLocal } from './temporary-connection/TemporaryConnectionRpcLocal'
import { formStreamPartContentDeliveryServiceId } from './formStreamPartDeliveryServiceId'

type ContentDeliveryLayerNodeOptions = MarkOptional<
    StrictContentDeliveryLayerNodeOptions,
    | 'nearbyNodeView'
    | 'randomNodeView'
    | 'neighbors'
    | 'leftNodeView'
    | 'rightNodeView'
    | 'propagation'
    | 'handshaker'
    | 'neighborFinder'
    | 'neighborUpdateManager'
    | 'neighborTargetCount'
    | 'rpcCommunicator'
    | 'nodeViewSize'
    | 'inspector'
    | 'temporaryConnectionRpcLocal'
> & {
    maxContactCount?: number
    minPropagationTargets?: number
    acceptProxyConnections?: boolean
    neighborUpdateInterval?: number
}

const createConfigWithDefaults = (options: ContentDeliveryLayerNodeOptions): StrictContentDeliveryLayerNodeOptions => {
    const ownNodeId = toNodeId(options.localPeerDescriptor)
    const rpcCommunicator =
        options.rpcCommunicator ??
        new ListeningRpcCommunicator(formStreamPartContentDeliveryServiceId(options.streamPartId), options.transport)
    const neighborTargetCount = options.neighborTargetCount ?? 4
    const maxContactCount = options.maxContactCount ?? 20
    const minPropagationTargets = options.minPropagationTargets ?? 2
    const acceptProxyConnections = options.acceptProxyConnections ?? false
    const neighborUpdateInterval = options.neighborUpdateInterval ?? 10000
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
    const proxyConnectionRpcLocal = acceptProxyConnections
        ? new ProxyConnectionRpcLocal({
              localPeerDescriptor: options.localPeerDescriptor,
              streamPartId: options.streamPartId,
              rpcCommunicator
          })
        : undefined
    const propagation =
        options.propagation ??
        new Propagation({
            minPropagationTargets,
            sendToNeighbor: async (neighborId: DhtAddress, msg: StreamMessage): Promise<void> => {
                const remote = neighbors.get(neighborId) ?? temporaryConnectionRpcLocal.getNodes().get(neighborId)
                const proxyConnection = proxyConnectionRpcLocal?.getConnection(neighborId)
                if (remote) {
                    await remote.sendStreamMessage(msg)
                } else if (proxyConnection) {
                    await proxyConnection.remote.sendStreamMessage(msg)
                } else {
                    throw new Error('Propagation target not found')
                }
            }
        })
    const handshaker =
        options.handshaker ??
        new Handshaker({
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
    const neighborFinder =
        options.neighborFinder ??
        new NeighborFinder({
            neighbors,
            leftNodeView,
            rightNodeView,
            nearbyNodeView,
            randomNodeView,
            doFindNeighbors: (excludedIds) => handshaker.attemptHandshakesOnContacts(excludedIds),
            minCount: neighborTargetCount
        })
    const neighborUpdateManager =
        options.neighborUpdateManager ??
        new NeighborUpdateManager({
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
    const inspector =
        options.inspector ??
        new Inspector({
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
        temporaryConnectionRpcLocal
    }
}

export const createContentDeliveryLayerNode = (options: ContentDeliveryLayerNodeOptions): ContentDeliveryLayerNode => {
    return new ContentDeliveryLayerNode(createConfigWithDefaults(options))
}
