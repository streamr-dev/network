import { Remote } from '@streamr/dht'
import { Logger } from '@streamr/utils'
import {
    LeaveStreamPartNotice,
    StreamMessage
} from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { INetworkRpcClient } from '../proto/packages/trackerless-network/protos/NetworkRpc.client'

const logger = new Logger(module)

export class RemoteRandomGraphNode extends Remote<INetworkRpcClient> {

    async sendStreamMessage(msg: StreamMessage): Promise<void> {
        const options = this.formDhtRpcOptions({
            notification: true
        })
        this.getClient().sendStreamMessage(msg, options).catch(() => {
            logger.trace('Failed to sendStreamMessage')
        })
    }

    leaveStreamPartNotice(): void {
        const notification: LeaveStreamPartNotice = {
            streamPartId: this.getServiceId()
        }
        const options = this.formDhtRpcOptions({
            notification: true
        })
        this.getClient().leaveStreamPartNotice(notification, options).catch(() => {
            logger.debug('Failed to send leaveStreamPartNotice')
        })
    }
}
