import { PeerDescriptor, RpcRemote, toNodeId } from '@streamr/dht'
import { Logger, StreamPartID } from '@streamr/utils'
import { NeighborUpdate } from '../../../generated/packages/trackerless-network/protos/NetworkRpc'
import { NeighborUpdateRpcClient } from '../../../generated/packages/trackerless-network/protos/NetworkRpc.client'

const logger = new Logger(module)

interface UpdateNeighborsResponse {
    peerDescriptors: PeerDescriptor[]
    removeMe: boolean
}

export class NeighborUpdateRpcRemote extends RpcRemote<NeighborUpdateRpcClient> {
    async updateNeighbors(streamPartId: StreamPartID, neighbors: PeerDescriptor[]): Promise<UpdateNeighborsResponse> {
        const request: NeighborUpdate = {
            streamPartId,
            neighborDescriptors: neighbors,
            removeMe: false
        }
        try {
            const response = await this.getClient().neighborUpdate(request, this.formDhtRpcOptions())
            return {
                peerDescriptors: response.neighborDescriptors,
                removeMe: response.removeMe
            }
        } catch (err: any) {
            logger.debug(`updateNeighbors to ${toNodeId(this.getPeerDescriptor())} failed`, { err })
            return {
                peerDescriptors: [],
                removeMe: true
            }
        }
    }
}
