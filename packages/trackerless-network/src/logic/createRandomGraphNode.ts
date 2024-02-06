import { DhtAddress, ListeningRpcCommunicator, getNodeIdFromPeerDescriptor } from '@streamr/dht'
import { Handshaker } from './neighbor-discovery/Handshaker'
import { NeighborFinder } from './neighbor-discovery/NeighborFinder'
import { NeighborUpdateManager } from './neighbor-discovery/NeighborUpdateManager'
import { StrictRandomGraphNodeConfig, RandomGraphNode } from './RandomGraphNode'
import { NodeList } from './NodeList'
import { Propagation } from './propagation/Propagation'
import { StreamMessage } from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { MarkOptional } from 'ts-essentials'
import { ProxyConnectionRpcLocal } from './proxy/ProxyConnectionRpcLocal'
import { Inspector } from './inspect/Inspector'
import { TemporaryConnectionRpcLocal } from './temporary-connection/TemporaryConnectionRpcLocal'
import { formStreamPartDeliveryServiceId } from './formStreamPartDeliveryServiceId'

type RandomGraphNodeConfig = MarkOptional<StrictRandomGraphNodeConfig,
    'nearbyNodeView' | 'randomNodeView' | 'neighbors' | 'propagation'
    | 'handshaker' | 'neighborFinder' | 'neighborUpdateManager' | 'neighborTargetCount'
    | 'rpcCommunicator' | 'nodeViewSize'
    | 'inspector' | 'temporaryConnectionRpcLocal'> & {
        maxContactCount?: number
        minPropagationTargets?: number
        acceptProxyConnections?: boolean
        neighborUpdateInterval?: number
    }

const createConfigWithDefaults = (config: RandomGraphNodeConfig): StrictRandomGraphNodeConfig => {
    const ownNodeId = getNodeIdFromPeerDescriptor(config.localPeerDescriptor)
    const rpcCommunicator = config.rpcCommunicator ?? new ListeningRpcCommunicator(
        formStreamPartDeliveryServiceId(config.streamPartId),
        config.transport
    )
    const neighborTargetCount = config.neighborTargetCount ?? 4
    const maxContactCount = config.maxContactCount ?? 20
    const minPropagationTargets = config.minPropagationTargets ?? 2
    const acceptProxyConnections = config.acceptProxyConnections ?? false
    const neighborUpdateInterval = config.neighborUpdateInterval ?? 10000
    const nearbyNodeView = config.nearbyNodeView ?? new NodeList(ownNodeId, maxContactCount)
    const randomNodeView = config.randomNodeView ?? new NodeList(ownNodeId, maxContactCount)
    const neighbors = config.neighbors ?? new NodeList(ownNodeId, maxContactCount)

    const temporaryConnectionRpcLocal = new TemporaryConnectionRpcLocal({
        rpcCommunicator,
        localPeerDescriptor: config.localPeerDescriptor,
        streamPartId: config.streamPartId,
        connectionLocker: config.connectionLocker
    })
    const proxyConnectionRpcLocal = acceptProxyConnections ? new ProxyConnectionRpcLocal({
        localPeerDescriptor: config.localPeerDescriptor,
        streamPartId: config.streamPartId,
        rpcCommunicator
    }) : undefined
    const propagation = config.propagation ?? new Propagation({
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
    const handshaker = config.handshaker ?? new Handshaker({
        localPeerDescriptor: config.localPeerDescriptor,
        streamPartId: config.streamPartId,
        connectionLocker: config.connectionLocker,
        rpcCommunicator,
        nearbyNodeView,
        randomNodeView,
        neighbors,
        maxNeighborCount: neighborTargetCount,
        rpcRequestTimeout: config.rpcRequestTimeout
    })
    const neighborFinder = config.neighborFinder ?? new NeighborFinder({
        neighbors,
        nearbyNodeView,
        doFindNeighbors: (excludedIds) => handshaker.attemptHandshakesOnContacts(excludedIds),
        minCount: neighborTargetCount
    })
    const neighborUpdateManager = config.neighborUpdateManager ?? new NeighborUpdateManager({
        neighbors,
        nearbyNodeView,
        localPeerDescriptor: config.localPeerDescriptor,
        neighborFinder,
        streamPartId: config.streamPartId,
        rpcCommunicator,
        neighborUpdateInterval,
        neighborTargetCount,
        connectionLocker: config.connectionLocker
    })
    const inspector = config.inspector ?? new Inspector({
        localPeerDescriptor: config.localPeerDescriptor,
        rpcCommunicator,
        streamPartId: config.streamPartId,
        connectionLocker: config.connectionLocker
    })
    return {
        ...config,
        nearbyNodeView,
        randomNodeView,
        neighbors,
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

export const createRandomGraphNode = (config: RandomGraphNodeConfig): RandomGraphNode => {
    return new RandomGraphNode(createConfigWithDefaults(config))
}
