import { RpcRemote } from '@streamr/dht'
import { Logger } from '@streamr/utils'
import {
    LeaveStreamPartNotice,
    StreamMessage
} from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { IDeliveryRpcClient } from '../proto/packages/trackerless-network/protos/NetworkRpc.client'

const logger = new Logger(module)

export class DeliveryRpcRemote extends RpcRemote<IDeliveryRpcClient> {

    async sendStreamMessage(msg: StreamMessage): Promise<void> {
        const options = this.formDhtRpcOptions({
            notification: true
        })
        this.getClient().sendStreamMessage(msg, options).catch(() => {
            logger.trace('Failed to sendStreamMessage')
        })
    }

    leaveStreamPartNotice(amEntryPoint: boolean): void {
        const notification: LeaveStreamPartNotice = {
            streamPartId: this.getServiceId(),
            amEntryPoint
        }
        const options = this.formDhtRpcOptions({
            notification: true
        })
        this.getClient().leaveStreamPartNotice(notification, options).catch(() => {
            logger.debug('Failed to send leaveStreamPartNotice')
        })
    }
}
