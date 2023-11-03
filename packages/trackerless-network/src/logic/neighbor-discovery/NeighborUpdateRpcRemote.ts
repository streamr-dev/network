import { PeerDescriptor, Remote } from '@streamr/dht'
import { Logger } from '@streamr/utils'
import { getNodeIdFromPeerDescriptor } from '../../identifiers'
import { NeighborUpdate } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { INeighborUpdateRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'

const logger = new Logger(module)

interface UpdateNeighborsResponse {
    peerDescriptors: PeerDescriptor[]
    removeMe: boolean
}

export class NeighborUpdateRpcRemote extends Remote<INeighborUpdateRpcClient> {

    async updateNeighbors(neighbors: PeerDescriptor[]): Promise<UpdateNeighborsResponse> {
        const request: NeighborUpdate = {
            streamPartId: this.getServiceId(),
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
            logger.debug(`updateNeighbors to ${getNodeIdFromPeerDescriptor(this.getPeerDescriptor())} failed: ${err}`)
            return {
                peerDescriptors: [],
                removeMe: true
            }
        }
    }
}
