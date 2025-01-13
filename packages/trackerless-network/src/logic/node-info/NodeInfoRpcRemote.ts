import { NodeInfoResponse } from '../../../generated/packages/trackerless-network/protos/NetworkRpc'
import { NodeInfoRpcClient } from '../../../generated/packages/trackerless-network/protos/NetworkRpc.client'
import { RpcRemote } from '@streamr/dht'

export class NodeInfoRpcRemote extends RpcRemote<NodeInfoRpcClient> {
    async getInfo(): Promise<NodeInfoResponse> {
        return this.getClient().getInfo({}, this.formDhtRpcOptions())
    }
}
