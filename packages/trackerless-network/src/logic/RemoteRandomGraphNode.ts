import { INetworkRpcClient } from '../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { PeerDescriptor, DhtRpcOptions, keyFromPeerDescriptor } from '@streamr/dht'
import {
    StreamMessage,
    LeaveStreamNotice,
    InspectConnectionRequest
} from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { Logger } from '@streamr/utils'
import { Remote } from './Remote'

const logger = new Logger(module)

export class RemoteRandomGraphNode extends Remote<INetworkRpcClient> {

    async inspectConnection(ownPeerDescriptor: PeerDescriptor): Promise<boolean> {
        const options: DhtRpcOptions = {
            sourceDescriptor: ownPeerDescriptor as PeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor as PeerDescriptor,
        }
        const request: InspectConnectionRequest = {
            senderId: keyFromPeerDescriptor(ownPeerDescriptor)
        }
        try {
            const response = await this.client.inspectConnection(request, options)
            return response.accepted
        } catch (err: any) {
            logger.debug(`inspectConnection to ${keyFromPeerDescriptor(this.getPeerDescriptor())} failed: ${err}`)
            return false
        }
    }

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
