import { ListeningRpcCommunicator, PeerIDKey, peerIdFromPeerDescriptor } from '@streamr/dht'
import { Handshaker } from './neighbor-discovery/Handshaker'
import { NeighborFinder } from './neighbor-discovery/NeighborFinder'
import { NeighborUpdateManager } from './neighbor-discovery/NeighborUpdateManager'
import { StrictRandomGraphNodeConfig, RandomGraphNode } from './RandomGraphNode'
import { PeerList } from './PeerList'
import { Propagation } from './propagation/Propagation'
import { StreamMessage } from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { MarkOptional } from 'ts-essentials'
import { ProxyStreamConnectionServer } from './proxy/ProxyStreamConnectionServer'
import { Inspector } from './inspect/Inspector'
import { TemporaryConnectionRpcServer } from './temporary-connection/TemporaryConnectionRpcServer'

type RandomGraphNodeConfig = MarkOptional<StrictRandomGraphNodeConfig,
    'nearbyContactPool' | 'randomContactPool' | 'targetNeighbors' | 'propagation'
    | 'handshaker' | 'neighborFinder' | 'neighborUpdateManager' | 'name' | 'numOfTargetNeighbors'
    | 'maxNumberOfContacts' | 'minPropagationTargets' | 'rpcCommunicator' | 'peerViewSize' | 'acceptProxyConnections'
    | 'neighborUpdateInterval' | 'inspector' | 'temporaryConnectionServer'>

const createConfigWithDefaults = (config: RandomGraphNodeConfig): StrictRandomGraphNodeConfig => {
    const peerId = peerIdFromPeerDescriptor(config.ownPeerDescriptor)
    const rpcCommunicator = config.rpcCommunicator ?? new ListeningRpcCommunicator(`layer2-${config.randomGraphId}`, config.P2PTransport)
    const name = config.name ?? peerId.toKey()
    const numOfTargetNeighbors = config.numOfTargetNeighbors ?? 4
    const maxNumberOfContacts = config.maxNumberOfContacts ?? 20
    const minPropagationTargets = config.minPropagationTargets ?? 2
    const acceptProxyConnections = config.acceptProxyConnections ?? false
    const neighborUpdateInterval = config.neighborUpdateInterval ?? 10000
    const nearbyContactPool = config.nearbyContactPool ?? new PeerList(peerId, numOfTargetNeighbors + 1)
    const randomContactPool = config.randomContactPool ?? new PeerList(peerId, maxNumberOfContacts)
    const targetNeighbors = config.targetNeighbors ?? new PeerList(peerId, maxNumberOfContacts)

    const temporaryConnectionServer = new TemporaryConnectionRpcServer({
        randomGraphId: config.randomGraphId,
        rpcCommunicator,
        ownPeerId: peerId
    })
    const proxyConnectionServer = acceptProxyConnections ? new ProxyStreamConnectionServer({
        ownPeerDescriptor: config.ownPeerDescriptor,
        streamPartId: config.randomGraphId,
        rpcCommunicator
    }) : undefined
    const propagation = config.propagation ?? new Propagation({
        minPropagationTargets,
        sendToNeighbor: async (neighborId: string, msg: StreamMessage): Promise<void> => {
            const remote = targetNeighbors.getNeighborById(neighborId) ?? temporaryConnectionServer.getPeers().getNeighborById(neighborId)
            const proxyConnection = proxyConnectionServer?.getConnection(neighborId as PeerIDKey)
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
        nearbyContactPool,
        randomContactPool,
        targetNeighbors,
        N: numOfTargetNeighbors
    })
    const neighborFinder = config.neighborFinder ?? new NeighborFinder({
        targetNeighbors,
        nearbyContactPool,
        doFindNeighbors: (excludedIds) => handshaker!.attemptHandshakesOnContacts(excludedIds),
        N: numOfTargetNeighbors
    })
    const neighborUpdateManager = config.neighborUpdateManager ?? new NeighborUpdateManager({
        targetNeighbors,
        nearbyContactPool,
        ownStringId: peerId.toKey(),
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
        nearbyContactPool,
        randomContactPool,
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
        peerViewSize: maxNumberOfContacts,
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
