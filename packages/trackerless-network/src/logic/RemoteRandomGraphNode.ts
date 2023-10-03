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
        super(ownPeerDescriptor, remotePeerDescriptor, serviceId, client)
    }

    async sendData(msg: StreamMessage): Promise<void> {
        const options = this.formDhtRpcOptions({
            notification: true
        })
        this.getClient().sendData(msg, options).catch(() => {
            logger.trace('Failed to sendData')
        })
    }

    leaveStreamNotice(): void {
        const notification: LeaveStreamNotice = {
            randomGraphId: this.getServiceId()
        }
        const options = this.formDhtRpcOptions({
            notification: true
        })
        this.getClient().leaveStreamNotice(notification, options).catch(() => {
            logger.debug('Failed to send leaveStreamNotice')
        })
    }
}
