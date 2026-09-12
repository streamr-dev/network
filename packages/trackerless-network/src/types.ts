import { ConnectionStatistics, DhtAddress, PeerDescriptor } from '@streamr/dht'
import { ChangeFieldType } from '@streamr/utils'
import { MarkRequired } from 'ts-essentials'
import {
    ContentDeliveryLayerNeighborInfo as ContentDeliveryLayerNeighborInfo_,
    NodeInfoResponse,
    StreamPartitionInfo as StreamPartitionInfo_
} from '../generated/packages/trackerless-network/protos/NetworkRpc'

// These types are part of trackerless-network's public API. Therefore removing optionality from fields which are 
// actually required. TODO: could do the same thing for other generated interfaces which are part of the public API.
export type ContentDeliveryLayerNeighborInfo = MarkRequired<ContentDeliveryLayerNeighborInfo_, 'peerDescriptor'>
export type StreamPartitionInfo = ChangeFieldType<Required<StreamPartitionInfo_>, 'contentDeliveryLayerNeighbors', ContentDeliveryLayerNeighborInfo[]>
export type NodeInfo = ChangeFieldType<Required<NodeInfoResponse>, 'streamPartitions', StreamPartitionInfo[]>

/**
 * Public per-neighbor view of a stream part. Plain data only (no class
 * instances), so it can be posted across worker boundaries as is.
 */
export interface NeighborInfo {
    nodeId: DhtAddress
    peerDescriptor: PeerDescriptor
    rtt?: number
    statistics?: ConnectionStatistics
}
