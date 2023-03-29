import { ListeningRpcCommunicator, peerIdFromPeerDescriptor } from '@streamr/dht'
import { Handshaker } from './neighbor-discovery/Handshaker'
import { NeighborFinder } from './neighbor-discovery/NeighborFinder'
import { NeighborUpdateManager } from './neighbor-discovery/NeighborUpdateManager'
import { StrictRandomGraphNodeConfig, RandomGraphNode } from './RandomGraphNode'
import { PeerList } from './PeerList'
import { Propagation } from './propagation/Propagation'
import { StreamMessage } from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { MarkOptional } from 'ts-essentials'

type RandomGraphNodeConfig = MarkOptional<StrictRandomGraphNodeConfig,
    "nearbyContactPool" | "randomContactPool" | "targetNeighbors" | "propagation"
    | "handshaker" | "neighborFinder" | "neighborUpdateManager" | "nodeName" | "numOfTargetNeighbors"
    | "maxNumberOfContacts" | "minPropagationTargets" | "rpcCommunicator" | "peerViewSize">

const createConfigWithDefaults = (config: RandomGraphNodeConfig) => {
    const peerId = peerIdFromPeerDescriptor(config.ownPeerDescriptor)
    const rpcCommunicator = config.rpcCommunicator ?? new ListeningRpcCommunicator(`layer2-${config.randomGraphId}`, config.P2PTransport)
    const nodeName = config.nodeName ?? peerId.toKey()
    const numOfTargetNeighbors = config.numOfTargetNeighbors ?? 4
    const maxNumberOfContacts = config.maxNumberOfContacts ?? 20
    const minPropagationTargets = config.minPropagationTargets ?? 2
    const nearbyContactPool = config.nearbyContactPool ?? new PeerList(peerId, maxNumberOfContacts)
    const randomContactPool = config.randomContactPool ?? new PeerList(peerId, maxNumberOfContacts)
    const targetNeighbors = config.targetNeighbors ?? new PeerList(peerId, maxNumberOfContacts)
    const propagation = config.propagation ?? new Propagation({
        minPropagationTargets,
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
        N: numOfTargetNeighbors
    })
    const neighborFinder = config.neighborFinder ?? new NeighborFinder({
        targetNeighbors: targetNeighbors,
        nearbyContactPool: nearbyContactPool,
        doFindNeighbors: (excludedIds) => handshaker!.attemptHandshakesOnContacts(excludedIds),
        N: numOfTargetNeighbors
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
        numOfTargetNeighbors,
        minPropagationTargets,
        maxNumberOfContacts,
        nodeName,
        peerViewSize: maxNumberOfContacts
    }
}

export const createRandomGraphNode = (config: RandomGraphNodeConfig): RandomGraphNode => {
    return new RandomGraphNode(createConfigWithDefaults(config))
}
