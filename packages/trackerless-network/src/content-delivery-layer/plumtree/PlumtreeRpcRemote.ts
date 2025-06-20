import { RpcRemote } from '@streamr/dht'
import { MessageID } from '../../../generated/packages/trackerless-network/protos/NetworkRpc'
import { PlumtreeRpcClient } from '../../../generated/packages/trackerless-network/protos/NetworkRpc.client'

export class PlumtreeRpcRemote extends RpcRemote<PlumtreeRpcClient> {

    async sendMetadata(msg: MessageID): Promise<void> {
        const options = this.formDhtRpcOptions({
            notification: true
        })
        await this.getClient().sendMetadata(msg, options)
    }

    async pauseNeighbor(messageChainId: string): Promise<void> {
        const options = this.formDhtRpcOptions({
            notification: true
        })
        await this.getClient().pauseNeighbor({ messageChainId }, options)
    }

    async resumeNeighbor(fromTimestamp: number, messageChainId: string): Promise<void> {
        const options = this.formDhtRpcOptions({
            notification: true
        })
        await this.getClient().resumeNeighbor({ fromTimestamp, messageChainId }, options)
    }

}
