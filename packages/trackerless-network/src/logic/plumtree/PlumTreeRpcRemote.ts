import { DhtAddress, RpcRemote } from "@streamr/dht"
import { MessageID } from "../../../generated/packages/trackerless-network/protos/NetworkRpc"
import { PlumTreeRpcClient } from "../../../generated/packages/trackerless-network/protos/NetworkRpc.client"

export class PlumTreeRpcRemote extends RpcRemote<PlumTreeRpcClient> {

    async sendMetadata(msg: MessageID): Promise<void> {
        const options = this.formDhtRpcOptions({
            notification: true
        })
        await this.getClient().sendMetadata(msg, options)
    }

    async pauseNeighbor(nodeId: DhtAddress): Promise<void> {
        const options = this.formDhtRpcOptions({
            notification: true
        })
        await this.getClient().pauseNeighbor({}, options)
    }

    async resumeNeighbor(nodeId: DhtAddress): Promise<void> {
        const options = this.formDhtRpcOptions({
            notification: true
        })
        await this.getClient().resumeNeighbor({}, options)
    }

}
