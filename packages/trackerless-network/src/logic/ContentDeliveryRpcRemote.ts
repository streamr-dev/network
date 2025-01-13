import { RpcRemote } from '@streamr/dht'
import { Logger, StreamPartID } from '@streamr/utils'
import { LeaveStreamPartNotice, StreamMessage } from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import { ContentDeliveryRpcClient } from '../../generated/packages/trackerless-network/protos/NetworkRpc.client'

const logger = new Logger(module)

export class ContentDeliveryRpcRemote extends RpcRemote<ContentDeliveryRpcClient> {
    private rtt?: number

    async sendStreamMessage(msg: StreamMessage): Promise<void> {
        const options = this.formDhtRpcOptions({
            notification: true
        })
        this.getClient()
            .sendStreamMessage(msg, options)
            .catch(() => {
                logger.trace('Failed to sendStreamMessage')
            })
    }

    leaveStreamPartNotice(streamPartId: StreamPartID, isLocalNodeEntryPoint: boolean): void {
        const notification: LeaveStreamPartNotice = {
            streamPartId,
            isEntryPoint: isLocalNodeEntryPoint
        }
        const options = this.formDhtRpcOptions({
            notification: true
        })
        this.getClient()
            .leaveStreamPartNotice(notification, options)
            .catch(() => {
                logger.debug('Failed to send leaveStreamPartNotice')
            })
    }

    setRtt(rtt: number): void {
        this.rtt = rtt
    }

    getRtt(): number | undefined {
        return this.rtt
    }
}
