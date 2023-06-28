import { INetworkRpcClient } from '../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { PeerDescriptor, DhtRpcOptions, keyFromPeerDescriptor } from '@streamr/dht'
import {
    StreamMessage,
    LeaveStreamNotice
} from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { Logger } from '@streamr/utils'
import { Remote } from './Remote'

const logger = new Logger(module)

export class RemoteRandomGraphNode extends Remote<INetworkRpcClient> {

    async sendData(ownPeerDescriptor: PeerDescriptor, msg: StreamMessage): Promise<void> {
        const options: DhtRpcOptions = {
            sourceDescriptor: ownPeerDescriptor as PeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor as PeerDescriptor,
            notification: true
        }
        this.client.sendData(msg, options).catch(() => {
            logger.trace('Failed to sendData')
        })
    }

    leaveStreamNotice(ownPeerDescriptor: PeerDescriptor): void {
        const options: DhtRpcOptions = {
            sourceDescriptor: ownPeerDescriptor as PeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor as PeerDescriptor,
            notification: true
        }
        const notification: LeaveStreamNotice = {
            senderId: keyFromPeerDescriptor(ownPeerDescriptor),
            randomGraphId: this.graphId
        }
        this.client.leaveStreamNotice(notification, options).catch(() => {
            logger.debug('Failed to send leaveStreamNotice')
        })
    }
}
