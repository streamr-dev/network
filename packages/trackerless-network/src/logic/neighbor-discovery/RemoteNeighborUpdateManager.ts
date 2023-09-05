import { DhtRpcOptions, PeerDescriptor } from '@streamr/dht'
import { Logger } from '@streamr/utils'
import { NeighborUpdate } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { Remote } from '../Remote'
import { INeighborUpdateRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { getNodeIdFromPeerDescriptor } from '../../identifiers'

const logger = new Logger(module)

interface UpdateNeighborsResponse {
    peerDescriptors: PeerDescriptor[]
    removeMe: boolean
}

export class RemoteNeighborUpdateManager extends Remote<INeighborUpdateRpcClient> {

    async updateNeighbors(ownPeerDescriptor: PeerDescriptor, neighbors: PeerDescriptor[]): Promise<UpdateNeighborsResponse> {
        const options: DhtRpcOptions = {
            sourceDescriptor: ownPeerDescriptor as PeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor as PeerDescriptor,
        }
        const request: NeighborUpdate = {
            senderId: getNodeIdFromPeerDescriptor(ownPeerDescriptor),
            randomGraphId: this.graphId,
            neighborDescriptors: neighbors,
            removeMe: false
        }
        try {
            const response = await this.client.neighborUpdate(request, options)
            return {
                peerDescriptors: response.neighborDescriptors!,
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
