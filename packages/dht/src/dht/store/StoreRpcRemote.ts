import { EXISTING_CONNECTION_TIMEOUT, RpcRemote } from '../contact/RpcRemote'
import { IStoreRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import {
    ReplicateDataRequest,
    StoreDataRequest
} from '../../proto/packages/dht/protos/DhtRpc'
import { getNodeIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'

export class StoreRpcRemote extends RpcRemote<IStoreRpcClient> {

    async storeData(request: StoreDataRequest): Promise<void> {
        const options = this.formDhtRpcOptions()
        try {
            await this.getClient().storeData(request, options)
        } catch (err) {
            const to = getNodeIdFromPeerDescriptor(this.getPeerDescriptor())
            const from = getNodeIdFromPeerDescriptor(this.getLocalPeerDescriptor())
            throw new Error(`Could not store data to ${to} from ${from} ${err}`)
        }
    }

    async replicateData(request: ReplicateDataRequest): Promise<void> {
        const options = this.formDhtRpcOptions({
            timeout: EXISTING_CONNECTION_TIMEOUT
        })
        return this.getClient().replicateData(request, options)
    }

}
