import { NodeInfoResponse } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { NodeInfoRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { RpcRemote } from '@streamr/dht'

export class NodeInfoRpcRemote extends RpcRemote<NodeInfoRpcClient> {

    async getInfo(): Promise<NodeInfoResponse> {
        // TODO: Why does TS think this is Promise<void>: https://github.com/streamr-dev/network/pull/2293
        const result = await this.getClient().getInfo({}, this.formDhtRpcOptions())
        return result as unknown as NodeInfoResponse
    }

}
