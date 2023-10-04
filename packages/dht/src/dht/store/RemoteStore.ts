import { Remote } from '../contact/Remote'
import { IStoreServiceClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { 
    DeleteDataRequest,
    DeleteDataResponse,
    MigrateDataRequest,
    MigrateDataResponse,
    StoreDataRequest,
    StoreDataResponse
} from '../../proto/packages/dht/protos/DhtRpc'
import { keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'

export class RemoteStore extends Remote<IStoreServiceClient> {

    async storeData(request: StoreDataRequest): Promise<StoreDataResponse> {
        const options = this.formDhtRpcOptions({
            timeout: 10000
        })
        try {
            return await this.getClient().storeData(request, options)
        } catch (err) {
            const to = keyFromPeerDescriptor(this.getPeerDescriptor())
            const from = keyFromPeerDescriptor(this.getLocalPeerDescriptor())
            throw Error(
                `Could not store data to ${to} from ${from} ${err}`
            )
        }
    }

    async deleteData(request: DeleteDataRequest): Promise<DeleteDataResponse> {
        const options = this.formDhtRpcOptions({
            timeout: 10000
        })
        try {
            return await this.getClient().deleteData(request, options)
        } catch (err) {
            throw Error(
                `Could not call delete data to ${keyFromPeerDescriptor(this.getPeerDescriptor())} ${err}`
            )
        }
    }

    async migrateData(request: MigrateDataRequest, doNotConnect: boolean = false): Promise<MigrateDataResponse> {
        const options = this.formDhtRpcOptions({
            timeout: 10000,
            doNotConnect
        })
        return this.getClient().migrateData(request, options)
    }

}
