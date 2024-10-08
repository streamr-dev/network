import { DhtAddress, toDhtAddressRaw } from '../identifiers'
import { Any } from '../proto/google/protobuf/any'
import { DataEntry, ExternalFetchDataRequest, ExternalStoreDataRequest, PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { ExternalApiRpcClient } from '../proto/packages/dht/protos/DhtRpc.client'
import { RpcRemote } from './contact/RpcRemote'

export class ExternalApiRpcRemote extends RpcRemote<ExternalApiRpcClient> {

    async externalFetchData(key: DhtAddress): Promise<DataEntry[]> {
        const request: ExternalFetchDataRequest = {
            key: toDhtAddressRaw(key)
        }
        const options = this.formDhtRpcOptions({
            // TODO use options option or named constant?
            timeout: 10000
        })
        try {
            const data = await this.getClient().externalFetchData(request, options)
            return data.entries
        } catch {
            return []
        }
    }

    async storeData(key: DhtAddress, data: Any): Promise<PeerDescriptor[]> {
        const request: ExternalStoreDataRequest = {
            key: toDhtAddressRaw(key),
            data
        }
        const options = this.formDhtRpcOptions({
            // TODO use options option or named constant?
            timeout: 10000
        })
        try {
            const response = await this.getClient().externalStoreData(request, options)
            return response.storers
        } catch {
            return []
        }
    }
}
