import { DataKey, getRawFromDataKey } from '../identifiers'
import { Any } from '../proto/google/protobuf/any'
import { DataEntry, ExternalFindDataRequest, ExternalStoreDataRequest, PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { ExternalApiRpcClient } from '../proto/packages/dht/protos/DhtRpc.client'
import { RpcRemote } from './contact/RpcRemote'

export class ExternalApiRpcRemote extends RpcRemote<ExternalApiRpcClient> {

    async externalFindData(key: DataKey): Promise<DataEntry[]> {
        const request: ExternalFindDataRequest = {
            key: getRawFromDataKey(key)
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

    async storeData(key: DataKey, data: Any): Promise<PeerDescriptor[]> {
        const request: ExternalStoreDataRequest = {
            key: getRawFromDataKey(key),
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
