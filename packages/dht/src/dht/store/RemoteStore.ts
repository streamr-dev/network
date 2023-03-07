import { Remote } from '../contact/Remote'
import { IStoreServiceClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { StoreDataRequest, StoreDataResponse } from '../../proto/packages/dht/protos/DhtRpc'
import { DhtRpcOptions } from '../../rpc-protocol/DhtRpcOptions'
import { keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'

export class RemoteStore extends Remote<IStoreServiceClient> {

    async storeData(request: StoreDataRequest): Promise<StoreDataResponse> {
        const options: DhtRpcOptions = {
            sourceDescriptor: this.ownPeerDescriptor,
            targetDescriptor: this.peerDescriptor,
            timeout: 10000
        }
        try {
            const result = await this.client.storeData(request, options)
            return result
        } catch (err) {
            throw Error(
                `Could not store data to ${keyFromPeerDescriptor(this.peerDescriptor)} from ${keyFromPeerDescriptor(this.ownPeerDescriptor)} ${err}`
            )
        }
    }

}
