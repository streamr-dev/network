import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtCallContext, ListeningRpcCommunicator } from '@streamr/dht'
import { PeerDescriptor } from '@streamr/dht/src/exports'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { getNodeIdFromPeerDescriptor } from '../../identifiers'
import { NeighborUpdate } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { NetworkRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { INeighborUpdateRpc } from '../../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { NodeList } from '../NodeList'
import { RemoteRandomGraphNode } from '../RemoteRandomGraphNode'
import { INeighborFinder } from './NeighborFinder'

interface NeighborUpdateManagerConfig {
    ownPeerDescriptor: PeerDescriptor
    randomGraphId: string
    targetNeighbors: NodeList
    nearbyNodeView: NodeList
    neighborFinder: INeighborFinder
    rpcCommunicator: ListeningRpcCommunicator
}

export class NeighborUpdateManagerServer implements INeighborUpdateRpc {

    private readonly config: NeighborUpdateManagerConfig

    constructor(config: NeighborUpdateManagerConfig) {
        this.config = config
    }

    // INetworkRpc server method
    async neighborUpdate(message: NeighborUpdate, context: ServerCallContext): Promise<NeighborUpdate> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const senderId = getNodeIdFromPeerDescriptor(senderPeerDescriptor)
        if (this.config.targetNeighbors.hasNodeById(senderId)) {
            const newPeerDescriptors = message.neighborDescriptors
                .filter((peerDescriptor) => {
                    const nodeId = getNodeIdFromPeerDescriptor(peerDescriptor)
                    const ownNodeId = getNodeIdFromPeerDescriptor(this.config.ownPeerDescriptor)
                    return nodeId !== ownNodeId && !this.config.targetNeighbors.getIds().includes(nodeId)
                })
            newPeerDescriptors.forEach((peerDescriptor) => this.config.nearbyNodeView.add(
                new RemoteRandomGraphNode(
                    this.config.ownPeerDescriptor,
                    peerDescriptor,
                    this.config.randomGraphId,
                    toProtoRpcClient(new NetworkRpcClient(this.config.rpcCommunicator.getRpcClientTransport()))
                ))
            )
            this.config.neighborFinder.start()
            const response: NeighborUpdate = {
                streamPartId: this.config.randomGraphId,
                neighborDescriptors: this.config.targetNeighbors.getAll().map((neighbor) => neighbor.getPeerDescriptor()),
                removeMe: false
            }
            return response
        } else {
            const response: NeighborUpdate = {
                streamPartId: this.config.randomGraphId,
                neighborDescriptors: this.config.targetNeighbors.getAll().map((neighbor) => neighbor.getPeerDescriptor()),
                removeMe: true
            }
            return response
        }
    }
}
