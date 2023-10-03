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
import { StreamPartIDUtils } from '@streamr/protocol'
import { NodeID, getNodeIdFromPeerDescriptor } from '../identifiers'

type RandomGraphNodeConfig = MarkOptional<StrictRandomGraphNodeConfig,
    'nearbyNodeView' | 'randomNodeView' | 'targetNeighbors' | 'propagation'
    | 'handshaker' | 'neighborFinder' | 'neighborUpdateManager' | 'name' | 'numOfTargetNeighbors'
    | 'maxNumberOfContacts' | 'minPropagationTargets' | 'rpcCommunicator' | 'nodeViewSize' | 'acceptProxyConnections'
    | 'neighborUpdateInterval' | 'inspector' | 'temporaryConnectionServer'>

const createConfigWithDefaults = (config: RandomGraphNodeConfig): StrictRandomGraphNodeConfig => {
    const ownNodeId = getNodeIdFromPeerDescriptor(config.ownPeerDescriptor)
    const rpcCommunicator = config.rpcCommunicator ?? new ListeningRpcCommunicator(`layer2-${config.randomGraphId}`, config.P2PTransport)
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
        randomGraphId: config.randomGraphId,
        rpcCommunicator,
        ownPeerDescriptor: config.ownPeerDescriptor
    })
    const proxyConnectionServer = acceptProxyConnections ? new ProxyStreamConnectionServer({
        ownPeerDescriptor: config.ownPeerDescriptor,
        streamPartId: StreamPartIDUtils.parse(config.randomGraphId),
        rpcCommunicator
    }) : undefined
    const propagation = config.propagation ?? new Propagation({
        minPropagationTargets,
        sendToNeighbor: async (neighborId: NodeID, msg: StreamMessage): Promise<void> => {
            const remote = targetNeighbors.getNeighborById(neighborId) ?? temporaryConnectionServer.getNodes().getNeighborById(neighborId)
            const proxyConnection = proxyConnectionServer?.getConnection(neighborId)
            if (remote) {
                await remote.sendData(config.ownPeerDescriptor, msg)
            } else if (proxyConnection) {
                await proxyConnection.remote.sendData(config.ownPeerDescriptor, msg)
            } else {
                throw new Error('Propagation target not found')
            }
        }
    })
    const handshaker = config.handshaker ?? new Handshaker({
        ownPeerDescriptor: config.ownPeerDescriptor,
        randomGraphId: config.randomGraphId,
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
        randomGraphId: config.randomGraphId,
        rpcCommunicator,
        neighborUpdateInterval
    })
    const inspector = config.inspector ?? new Inspector({
        ownPeerDescriptor: config.ownPeerDescriptor,
        rpcCommunicator,
        graphId: config.randomGraphId,
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
