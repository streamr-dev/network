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
    'nearbyNodeView' | 'randomNodeView' | 'targetNeighbors' | 'propagation'
    | 'handshaker' | 'neighborFinder' | 'neighborUpdateManager' | 'targetNeighborCount'
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
    const targetNeighborCount = config.targetNeighborCount ?? 4
    const maxContactCount = config.maxContactCount ?? 20
    const minPropagationTargets = config.minPropagationTargets ?? 2
    const acceptProxyConnections = config.acceptProxyConnections ?? false
    const neighborUpdateInterval = config.neighborUpdateInterval ?? 10000
    const nearbyNodeView = config.nearbyNodeView ?? new NodeList(ownNodeId, targetNeighborCount + 1)
    const randomNodeView = config.randomNodeView ?? new NodeList(ownNodeId, maxContactCount)
    const targetNeighbors = config.targetNeighbors ?? new NodeList(ownNodeId, maxContactCount)

    const temporaryConnectionRpcLocal = new TemporaryConnectionRpcLocal({
        rpcCommunicator,
        localPeerDescriptor: config.localPeerDescriptor
    })
    const proxyConnectionRpcLocal = acceptProxyConnections ? new ProxyConnectionRpcLocal({
        localPeerDescriptor: config.localPeerDescriptor,
        streamPartId: config.streamPartId,
        rpcCommunicator
    }) : undefined
    const propagation = config.propagation ?? new Propagation({
        minPropagationTargets,
        sendToNeighbor: async (neighborId: DhtAddress, msg: StreamMessage): Promise<void> => {
            const remote = targetNeighbors.get(neighborId) ?? temporaryConnectionRpcLocal.getNodes().get(neighborId)
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
        targetNeighbors,
        maxNeighborCount: targetNeighborCount,
        rpcRequestTimeout: config.rpcRequestTimeout
    })
    const neighborFinder = config.neighborFinder ?? new NeighborFinder({
        targetNeighbors,
        nearbyNodeView,
        doFindNeighbors: (excludedIds) => handshaker.attemptHandshakesOnContacts(excludedIds),
        minCount: targetNeighborCount
    })
    const neighborUpdateManager = config.neighborUpdateManager ?? new NeighborUpdateManager({
        targetNeighbors,
        nearbyNodeView,
        localPeerDescriptor: config.localPeerDescriptor,
        neighborFinder,
        streamPartId: config.streamPartId,
        rpcCommunicator,
        neighborUpdateInterval
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
        targetNeighbors,
        rpcCommunicator,
        handshaker,
        neighborFinder,
        neighborUpdateManager,
        propagation,
        targetNeighborCount,
        nodeViewSize: maxContactCount,
        proxyConnectionRpcLocal,
        inspector,
        temporaryConnectionRpcLocal
    }
}

export const createRandomGraphNode = (config: RandomGraphNodeConfig): RandomGraphNode => {
    return new RandomGraphNode(createConfigWithDefaults(config))
}
