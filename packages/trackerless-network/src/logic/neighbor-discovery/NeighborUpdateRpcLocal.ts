import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtAddress, DhtCallContext, ListeningRpcCommunicator, PeerDescriptor, toNodeId } from '@streamr/dht'
import { StreamPartID } from '@streamr/utils'
import { NeighborUpdate } from '../../../generated/packages/trackerless-network/protos/NetworkRpc'
import { ContentDeliveryRpcClient } from '../../../generated/packages/trackerless-network/protos/NetworkRpc.client'
import { INeighborUpdateRpc } from '../../../generated/packages/trackerless-network/protos/NetworkRpc.server'
import { ContentDeliveryRpcRemote } from '../ContentDeliveryRpcRemote'
import { NodeList } from '../NodeList'
import { NeighborFinder } from './NeighborFinder'

interface NeighborUpdateRpcLocalOptions {
    localPeerDescriptor: PeerDescriptor
    streamPartId: StreamPartID
    neighbors: NodeList
    nearbyNodeView: NodeList
    neighborFinder: NeighborFinder
    rpcCommunicator: ListeningRpcCommunicator
    neighborTargetCount: number
    ongoingHandshakes: Set<DhtAddress>
}

export class NeighborUpdateRpcLocal implements INeighborUpdateRpc {
    private readonly options: NeighborUpdateRpcLocalOptions

    constructor(options: NeighborUpdateRpcLocalOptions) {
        this.options = options
    }

    private updateContacts(neighborDescriptors: PeerDescriptor[]): void {
        const ownNodeId = toNodeId(this.options.localPeerDescriptor)
        const newPeerDescriptors = neighborDescriptors.filter((peerDescriptor) => {
            const nodeId = toNodeId(peerDescriptor)
            return nodeId !== ownNodeId && !this.options.neighbors.getIds().includes(nodeId)
        })
        newPeerDescriptors.forEach((peerDescriptor) =>
            this.options.nearbyNodeView.add(
                new ContentDeliveryRpcRemote(
                    this.options.localPeerDescriptor,
                    peerDescriptor,
                    this.options.rpcCommunicator,
                    ContentDeliveryRpcClient
                )
            )
        )
    }

    private createResponse(removeMe: boolean): NeighborUpdate {
        return {
            streamPartId: this.options.streamPartId,
            neighborDescriptors: this.options.neighbors.getAll().map((neighbor) => neighbor.getPeerDescriptor()),
            removeMe
        }
    }

    // INeighborUpdateRpc server method
    async neighborUpdate(message: NeighborUpdate, context: ServerCallContext): Promise<NeighborUpdate> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const remoteNodeId = toNodeId(senderPeerDescriptor)
        this.updateContacts(message.neighborDescriptors)
        if (!this.options.neighbors.has(remoteNodeId) && !this.options.ongoingHandshakes.has(remoteNodeId)) {
            return this.createResponse(true)
        } else {
            const isOverNeighborCount =
                this.options.neighbors.size() > this.options.neighborTargetCount &&
                // Motivation: We don't know the remote's neighborTargetCount setting here. We only ask to cut connections
                // if the remote has a "sufficient" number of neighbors, where "sufficient" means our neighborTargetCount
                // setting.
                message.neighborDescriptors.length > this.options.neighborTargetCount
            if (!isOverNeighborCount) {
                this.options.neighborFinder.start()
            } else {
                this.options.neighbors.remove(remoteNodeId)
            }
            return this.createResponse(isOverNeighborCount)
        }
    }
}
