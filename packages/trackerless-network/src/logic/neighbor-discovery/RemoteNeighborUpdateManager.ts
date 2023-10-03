import { DhtRpcOptions, PeerDescriptor, Remote } from '@streamr/dht'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { Logger } from '@streamr/utils'
import { getNodeIdFromPeerDescriptor } from '../../identifiers'
import { NeighborUpdate } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { INeighborUpdateRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'

const logger = new Logger(module)

interface UpdateNeighborsResponse {
    peerDescriptors: PeerDescriptor[]
    removeMe: boolean
}

export class RemoteNeighborUpdateManager extends Remote<INeighborUpdateRpcClient> {

    constructor(
        ownPeerDescriptor: PeerDescriptor,
        remotePeerDescriptor: PeerDescriptor,
        serviceId: string,
        client: ProtoRpcClient<INeighborUpdateRpcClient>
    ) {
        super(ownPeerDescriptor, remotePeerDescriptor, client, serviceId)
    }

    async updateNeighbors(ownPeerDescriptor: PeerDescriptor, neighbors: PeerDescriptor[]): Promise<UpdateNeighborsResponse> {
        const options: DhtRpcOptions = this.formDhtRpcOptions(ownPeerDescriptor)
        const request: NeighborUpdate = {
            randomGraphId: this.getServiceId(),
            neighborDescriptors: neighbors,
            removeMe: false
        }
        try {
            const response = await this.client.neighborUpdate(request, options)
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
