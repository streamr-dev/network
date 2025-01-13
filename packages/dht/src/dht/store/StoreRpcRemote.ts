import { toNodeId } from '../../identifiers'
import { ReplicateDataRequest, StoreDataRequest } from '../../../generated/packages/dht/protos/DhtRpc'
import { StoreRpcClient } from '../../../generated/packages/dht/protos/DhtRpc.client'
import { EXISTING_CONNECTION_TIMEOUT, RpcRemote } from '../contact/RpcRemote'

export class StoreRpcRemote extends RpcRemote<StoreRpcClient> {
    async storeData(request: StoreDataRequest): Promise<void> {
        const options = this.formDhtRpcOptions()
        try {
            await this.getClient().storeData(request, options)
        } catch (err) {
            const to = toNodeId(this.getPeerDescriptor())
            const from = toNodeId(this.getLocalPeerDescriptor())
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            throw new Error(`Could not store data to ${to} from ${from} ${err}`)
        }
    }

    async replicateData(request: ReplicateDataRequest, connect: boolean): Promise<void> {
        const options = this.formDhtRpcOptions({
            timeout: EXISTING_CONNECTION_TIMEOUT,
            notification: true,
            connect
        })
        return this.getClient().replicateData(request, options)
    }
}
