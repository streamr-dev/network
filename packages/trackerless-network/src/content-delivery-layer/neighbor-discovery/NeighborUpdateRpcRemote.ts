import { PeerDescriptor, RpcRemote, toNodeId } from '@streamr/dht'
import { Logger, StreamPartID } from '@streamr/utils'
import { NeighborUpdate } from '../../../generated/packages/trackerless-network/protos/NetworkRpc'
import { NeighborUpdateRpcClient } from '../../../generated/packages/trackerless-network/protos/NetworkRpc.client'

const logger = new Logger('NeighborUpdateRpcRemote')

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
            // A failed/timed-out update carries no information about whether the
            // remote still considers us a neighbor (on a congested link the response
            // is simply queued behind stream data). Treating it as `removeMe` made
            // the sender drop the neighbor and publish into the void for seconds to
            // minutes. Propagate the error instead; connection-level disconnects and
            // explicit removeMe/leave notices still remove neighbors.
            logger.debug(`updateNeighbors to ${toNodeId(this.getPeerDescriptor())} failed`, { err })
            throw err
        }
    }
}
