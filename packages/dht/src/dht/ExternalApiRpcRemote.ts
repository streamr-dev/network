import { Any } from '../proto/google/protobuf/any'
import { DataEntry, ExternalStoreDataRequest, ExternalFindDataRequest, PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { IExternalApiRpcClient } from '../proto/packages/dht/protos/DhtRpc.client'
import { RpcRemote } from './contact/RpcRemote'

export class ExternalApiRpcRemote extends RpcRemote<IExternalApiRpcClient> {

    async externalFindData(key: Uint8Array): Promise<DataEntry[]> {
        const request: ExternalFindDataRequest = {
            key
        }
        const options = this.formDhtRpcOptions({
            // TODO use config option or named constant?
            timeout: 10000
        })
        try {
            const data = await this.getClient().externalFindData(request, options)
            return data.entries
        } catch (err) {
            return []
        }
    }

    async storeData(key: Uint8Array, data: Any): Promise<PeerDescriptor[]> {
        const request: ExternalStoreDataRequest = {
            key,
            data
        }
        const options = this.formDhtRpcOptions({
            // TODO use config option or named constant?
            timeout: 10000
        })
        try {
            const response = await this.getClient().externalStoreData(request, options)
            return response.storers
        } catch (err) {
            return []
        }
    }
}
