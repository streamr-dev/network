import { ListeningRpcCommunicator, peerIdFromPeerDescriptor } from '@streamr/dht'
import { Handshaker } from './neighbor-discovery/Handshaker'
import { NeighborFinder } from './neighbor-discovery/NeighborFinder'
import { NeighborUpdateManager } from './neighbor-discovery/NeighborUpdateManager'
import { RandomGraphNodeConfig, RandomGraphNode } from './RandomGraphNode'
import { PeerList } from './PeerList'
import { Propagation } from './propagation/Propagation'
import { StreamMessage } from '../proto/packages/trackerless-network/protos/NetworkRpc'

const PEER_VIEW_SIZE = 20
const N = 4

const createConfigWithDefaults = (config: RandomGraphNodeConfig) => {
    const peerId = peerIdFromPeerDescriptor(config.ownPeerDescriptor)
    const rpcCommunicator = new ListeningRpcCommunicator(`layer2-${config.randomGraphId}`, config.P2PTransport)
    const nearbyContactPool = config.nearbyContactPool ?? new PeerList(peerId, PEER_VIEW_SIZE)
    const randomContactPool = config.randomContactPool ?? new PeerList(peerId, PEER_VIEW_SIZE)
    const targetNeighbors = config.targetNeighbors ?? new PeerList(peerId, PEER_VIEW_SIZE)
    const propagation = config.propagation ?? new Propagation({
        minPropagationTargets: 2,
        randomGraphId: config.randomGraphId,
        sendToNeighbor: async (neighborId: string, msg: StreamMessage): Promise<void> => {
            const remote = targetNeighbors.getNeighborWithId(neighborId)
            if (remote) {
                await remote.sendData(config.ownPeerDescriptor, msg)
            } else {
                throw new Error('Propagation target not found')
            }
        }
    })
    const handshaker = config.handshaker ?? new Handshaker({
        ownPeerDescriptor: config.ownPeerDescriptor,
        randomGraphId: config.randomGraphId,
        nearbyContactPool: nearbyContactPool!,
        randomContactPool: randomContactPool!,
        targetNeighbors: targetNeighbors!,
        connectionLocker: config.connectionLocker,
        rpcCommunicator: rpcCommunicator!,
        nodeName: config.nodeName,
        N
    })
    const neighborFinder = config.neighborFinder ?? new NeighborFinder({
        targetNeighbors: targetNeighbors,
        nearbyContactPool: nearbyContactPool,
        doFindNeighbors: (excludedIds) => handshaker!.attemptHandshakesOnContacts(excludedIds),
        N
    })
    const neighborUpdateManager = config.neighborUpdateManager ?? new NeighborUpdateManager({
        targetNeighbors: targetNeighbors,
        nearbyContactPool: nearbyContactPool,
        ownStringId: peerId.toKey(),
        ownPeerDescriptor: config.ownPeerDescriptor,
        neighborFinder: neighborFinder,
        randomGraphId: config.randomGraphId,
        rpcCommunicator: rpcCommunicator
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
        N,
        peerViewSize: PEER_VIEW_SIZE
    }
}

export const createRandomGraphNode = (config: RandomGraphNodeConfig): RandomGraphNode => {
    return new RandomGraphNode(createConfigWithDefaults(config))
}
