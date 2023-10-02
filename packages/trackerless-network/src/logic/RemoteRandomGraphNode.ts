import { PeerDescriptor } from '@streamr/dht'
import { Logger } from '@streamr/utils'
import {
    LeaveStreamNotice,
    StreamMessage
} from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { INetworkRpcClient } from '../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { Remote } from './Remote'

const logger = new Logger(module)

export class RemoteRandomGraphNode extends Remote<INetworkRpcClient> {

    async sendData(ownPeerDescriptor: PeerDescriptor, msg: StreamMessage): Promise<void> {
        const options = this.formDhtRpcOptions(ownPeerDescriptor, {
            notification: true
        })
        this.client.sendData(msg, options).catch(() => {
            logger.trace('Failed to sendData')
        })
    }

    leaveStreamNotice(ownPeerDescriptor: PeerDescriptor): void {
        const options = this.formDhtRpcOptions(ownPeerDescriptor, {
            notification: true
        })
        const notification: LeaveStreamNotice = {
            randomGraphId: this.graphId
        }
        this.client.leaveStreamNotice(notification, options).catch(() => {
            logger.debug('Failed to send leaveStreamNotice')
        })
    }
}
