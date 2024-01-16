import { InfoResponse } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { InfoRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { RpcRemote } from '@streamr/dht'

export class InfoRpcRemote extends RpcRemote<InfoRpcClient> {

    // streams is a list of streamPartIDs, if the list is empty then info of all streams is returned
    async getInfo(): Promise<InfoResponse> {
        // TODO: Why does TS think this is Promise<void>: https://github.com/streamr-dev/network/pull/2293
        const result = await this.getClient().getInfo({}, this.formDhtRpcOptions())
        return result as unknown as InfoResponse
    }

}
