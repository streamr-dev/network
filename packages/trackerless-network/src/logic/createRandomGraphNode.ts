import { ListeningRpcCommunicator } from '@streamr/dht'
import { Handshaker } from './neighbor-discovery/Handshaker'
import { NeighborFinder } from './neighbor-discovery/NeighborFinder'
import { NeighborUpdateManager } from './neighbor-discovery/NeighborUpdateManager'
import { StrictRandomGraphNodeConfig, RandomGraphNode } from './RandomGraphNode'
import { NodeList } from './NodeList'
import { Propagation } from './propagation/Propagation'
import { StreamMessage } from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { MarkOptional } from 'ts-essentials'
import { ProxyStreamConnectionServer } from './proxy/ProxyStreamConnectionServer'
import { Inspector } from './inspect/Inspector'
import { TemporaryConnectionRpcServer } from './temporary-connection/TemporaryConnectionRpcServer'
import { NodeID, getNodeIdFromPeerDescriptor } from '../identifiers'

type RandomGraphNodeConfig = MarkOptional<StrictRandomGraphNodeConfig,
    'nearbyNodeView' | 'randomNodeView' | 'targetNeighbors' | 'propagation'
    | 'handshaker' | 'neighborFinder' | 'neighborUpdateManager' | 'name' | 'numOfTargetNeighbors'
    | 'maxNumberOfContacts' | 'minPropagationTargets' | 'rpcCommunicator' | 'nodeViewSize' | 'acceptProxyConnections'
    | 'neighborUpdateInterval' | 'inspector' | 'temporaryConnectionServer'>

const createConfigWithDefaults = (config: RandomGraphNodeConfig): StrictRandomGraphNodeConfig => {
    const ownNodeId = getNodeIdFromPeerDescriptor(config.ownPeerDescriptor)
    const rpcCommunicator = config.rpcCommunicator ?? new ListeningRpcCommunicator(`layer2-${config.streamPartId}`, config.P2PTransport)
    const name = config.name ?? ownNodeId
    const numOfTargetNeighbors = config.numOfTargetNeighbors ?? 4
    const maxNumberOfContacts = config.maxNumberOfContacts ?? 20
    const minPropagationTargets = config.minPropagationTargets ?? 2
    const acceptProxyConnections = config.acceptProxyConnections ?? false
    const neighborUpdateInterval = config.neighborUpdateInterval ?? 10000
    const nearbyNodeView = config.nearbyNodeView ?? new NodeList(ownNodeId, numOfTargetNeighbors + 1)
    const randomNodeView = config.randomNodeView ?? new NodeList(ownNodeId, maxNumberOfContacts)
    const targetNeighbors = config.targetNeighbors ?? new NodeList(ownNodeId, maxNumberOfContacts)

    const temporaryConnectionServer = new TemporaryConnectionRpcServer({
        randomGraphId: config.streamPartId,
        rpcCommunicator,
        ownPeerDescriptor: config.ownPeerDescriptor
    })
    const proxyConnectionServer = acceptProxyConnections ? new ProxyStreamConnectionServer({
        ownPeerDescriptor: config.ownPeerDescriptor,
        streamPartId: config.streamPartId,
        rpcCommunicator
    }) : undefined
    const propagation = config.propagation ?? new Propagation({
        minPropagationTargets,
        sendToNeighbor: async (neighborId: NodeID, msg: StreamMessage): Promise<void> => {
            const remote = targetNeighbors.get(neighborId) ?? temporaryConnectionServer.getNodes().get(neighborId)
            const proxyConnection = proxyConnectionServer?.getConnection(neighborId)
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
        ownPeerDescriptor: config.ownPeerDescriptor,
        randomGraphId: config.streamPartId,
        connectionLocker: config.connectionLocker,
        rpcCommunicator,
        nearbyNodeView,
        randomNodeView,
        targetNeighbors,
        N: numOfTargetNeighbors
    })
    const neighborFinder = config.neighborFinder ?? new NeighborFinder({
        targetNeighbors,
        nearbyNodeView,
        doFindNeighbors: (excludedIds) => handshaker.attemptHandshakesOnContacts(excludedIds),
        N: numOfTargetNeighbors
    })
    const neighborUpdateManager = config.neighborUpdateManager ?? new NeighborUpdateManager({
        targetNeighbors,
        nearbyNodeView,
        ownPeerDescriptor: config.ownPeerDescriptor,
        neighborFinder,
        randomGraphId: config.streamPartId,
        rpcCommunicator,
        neighborUpdateInterval
    })
    const inspector = config.inspector ?? new Inspector({
        ownPeerDescriptor: config.ownPeerDescriptor,
        rpcCommunicator,
        graphId: config.streamPartId,
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
        numOfTargetNeighbors,
        minPropagationTargets,
        maxNumberOfContacts,
        name,
        nodeViewSize: maxNumberOfContacts,
        acceptProxyConnections,
        proxyConnectionServer,
        neighborUpdateInterval,
        inspector,
        temporaryConnectionServer
    }
}

export const createRandomGraphNode = (config: RandomGraphNodeConfig): RandomGraphNode => {
    return new RandomGraphNode(createConfigWithDefaults(config))
}
