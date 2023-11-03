import { Any } from '../proto/google/protobuf/any'
import { DataEntry, ExternalStoreDataRequest, FindDataRequest, PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { IExternalApiRpcClient } from '../proto/packages/dht/protos/DhtRpc.client'
import { Remote } from './contact/Remote'

export class ExternalApiRpcRemote extends Remote<IExternalApiRpcClient> {

    async findData(idToFind: Uint8Array): Promise<DataEntry[]> {
        const request: FindDataRequest = {
            kademliaId: idToFind
        }
        const options = this.formDhtRpcOptions({
            timeout: 10000
        })
        try {
            const data = await this.getClient().findData(request, options)
            return data.dataEntries
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
