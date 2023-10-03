import { PeerDescriptor, Remote } from '@streamr/dht'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { Logger } from '@streamr/utils'
import {
    LeaveStreamNotice,
    StreamMessage
} from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { INetworkRpcClient } from '../proto/packages/trackerless-network/protos/NetworkRpc.client'

const logger = new Logger(module)

export class RemoteRandomGraphNode extends Remote<INetworkRpcClient> {

    constructor(
        ownPeerDescriptor: PeerDescriptor,
        remotePeerDescriptor: PeerDescriptor,
        serviceId: string,
        client: ProtoRpcClient<INetworkRpcClient>,
    ) {
        super(ownPeerDescriptor, remotePeerDescriptor, client, serviceId)
    }

    async sendData(ownPeerDescriptor: PeerDescriptor, msg: StreamMessage): Promise<void> {
        const options = this.formDhtRpcOptions(ownPeerDescriptor, {
            notification: true
        })
        this.getClient().sendData(msg, options).catch(() => {
            logger.trace('Failed to sendData')
        })
    }

    leaveStreamNotice(ownPeerDescriptor: PeerDescriptor): void {
        const options = this.formDhtRpcOptions(ownPeerDescriptor, {
            notification: true
        })
        const notification: LeaveStreamNotice = {
            randomGraphId: this.getServiceId()
        }
        this.getClient().leaveStreamNotice(notification, options).catch(() => {
            logger.debug('Failed to send leaveStreamNotice')
        })
    }
}
