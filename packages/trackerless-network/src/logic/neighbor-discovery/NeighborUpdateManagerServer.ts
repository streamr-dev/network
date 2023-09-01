import { ListeningRpcCommunicator } from '@streamr/dht'
import { NeighborUpdate } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { INeighborUpdateRpc } from '../../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { NodeList } from '../NodeList'
import { INeighborFinder } from './NeighborFinder'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { NetworkRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { RemoteRandomGraphNode } from '../RemoteRandomGraphNode'
import { getNodeIdFromPeerDescriptor, NodeID } from '../../identifiers'

interface NeighborUpdateManagerConfig {
    ownStringId: string
    randomGraphId: string
    targetNeighbors: NodeList
    nearbyContactPool: NodeList
    neighborFinder: INeighborFinder
    rpcCommunicator: ListeningRpcCommunicator
}

export class NeighborUpdateManagerServer implements INeighborUpdateRpc {

    private readonly config: NeighborUpdateManagerConfig

    constructor(config: NeighborUpdateManagerConfig) {
        this.config = config
    }

    // INetworkRpc server method
    async neighborUpdate(message: NeighborUpdate, _context: ServerCallContext): Promise<NeighborUpdate> {
        if (this.config.targetNeighbors!.hasNodeById(message.senderId as NodeID)) {
            const newPeers = message.neighborDescriptors
                .filter((peerDescriptor) => {
                    const stringId = getNodeIdFromPeerDescriptor(peerDescriptor)
                    return stringId !== this.config.ownStringId && !this.config.targetNeighbors.getStringIds().includes(stringId)
                })
            newPeers.forEach((peer) => this.config.nearbyContactPool.add(
                new RemoteRandomGraphNode(
                    peer,
                    this.config.randomGraphId,
                    toProtoRpcClient(new NetworkRpcClient(this.config.rpcCommunicator!.getRpcClientTransport()))
                ))
            )
            this.config.neighborFinder!.start()
            const response: NeighborUpdate = {
                senderId: this.config.ownStringId,
                randomGraphId: this.config.randomGraphId,
                neighborDescriptors: this.config.targetNeighbors.getNodes().map((neighbor) => neighbor.getPeerDescriptor()),
                removeMe: false
            }
            return response
        } else {
            const response: NeighborUpdate = {
                senderId: this.config.ownStringId,
                randomGraphId: this.config.randomGraphId,
                neighborDescriptors: this.config.targetNeighbors.getNodes().map((neighbor) => neighbor.getPeerDescriptor()),
                removeMe: true
            }
            return response
        }
    }
}
