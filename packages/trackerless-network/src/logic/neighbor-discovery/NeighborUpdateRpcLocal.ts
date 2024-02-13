import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { ConnectionLocker, DhtAddress, DhtCallContext, ListeningRpcCommunicator, PeerDescriptor, getNodeIdFromPeerDescriptor } from '@streamr/dht'
import { NeighborUpdate } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { DeliveryRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { INeighborUpdateRpc } from '../../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { NodeList } from '../NodeList'
import { DeliveryRpcRemote } from '../DeliveryRpcRemote'
import { NeighborFinder } from './NeighborFinder'
import { StreamPartID } from '@streamr/protocol'

interface NeighborUpdateRpcLocalConfig {
    localPeerDescriptor: PeerDescriptor
    streamPartId: StreamPartID
    neighbors: NodeList
    nearbyNodeView: NodeList
    neighborFinder: NeighborFinder
    connectionLocker: ConnectionLocker
    rpcCommunicator: ListeningRpcCommunicator
    neighborTargetCount: number
    ongoingHandshakes: Set<DhtAddress>
}

export class NeighborUpdateRpcLocal implements INeighborUpdateRpc {

    private readonly config: NeighborUpdateRpcLocalConfig

    constructor(config: NeighborUpdateRpcLocalConfig) {
        this.config = config
    }

    private updateContacts(neighborDescriptors: PeerDescriptor[]): void {
        const ownNodeId = getNodeIdFromPeerDescriptor(this.config.localPeerDescriptor)
        const newPeerDescriptors = neighborDescriptors.filter((peerDescriptor) => {
            const nodeId = getNodeIdFromPeerDescriptor(peerDescriptor)
            return nodeId !== ownNodeId && !this.config.neighbors.getIds().includes(nodeId)
        })
        newPeerDescriptors.forEach((peerDescriptor) => this.config.nearbyNodeView.add(
            new DeliveryRpcRemote(
                this.config.localPeerDescriptor,
                peerDescriptor,
                this.config.rpcCommunicator,
                DeliveryRpcClient
            ))
        )
    }

    private createResponse(removeMe: boolean): NeighborUpdate {
        return {
            streamPartId: this.config.streamPartId,
            neighborDescriptors: this.config.neighbors.getAll().map((neighbor) => neighbor.getPeerDescriptor()),
            removeMe
        }
    }

    // INeighborUpdateRpc server method
    async neighborUpdate(message: NeighborUpdate, context: ServerCallContext): Promise<NeighborUpdate> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const senderId = getNodeIdFromPeerDescriptor(senderPeerDescriptor)
        this.updateContacts(message.neighborDescriptors)
        if (!this.config.neighbors.has(senderId) && !this.config.ongoingHandshakes.has(senderId)) {
            return this.createResponse(true)
        } else {
            const isOverNeighborCount = this.config.neighbors.size() > this.config.neighborTargetCount
                // Motivation: We don't know the remote's neighborTargetCount setting here. We only ask to cut connections
                // if the remote has a "sufficient" number of neighbors, where "sufficient" means our neighborTargetCount
                // setting.
                && message.neighborDescriptors.length > this.config.neighborTargetCount
            if (!isOverNeighborCount) {
                this.config.neighborFinder.start()
            } else {
                this.config.neighbors.remove(senderId)
                this.config.connectionLocker.weakUnlockConnection(getNodeIdFromPeerDescriptor(senderPeerDescriptor), this.config.streamPartId)
            }
            return this.createResponse(isOverNeighborCount)
        }
    }
}
