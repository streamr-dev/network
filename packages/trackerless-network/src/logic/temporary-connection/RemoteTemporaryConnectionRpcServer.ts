import { PeerDescriptor, Remote } from '@streamr/dht'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { Logger } from '@streamr/utils'
import { getNodeIdFromPeerDescriptor } from '../../identifiers'
import { ITemporaryConnectionRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'

const logger = new Logger(module)

export class RemoteTemporaryConnectionRpcServer extends Remote<ITemporaryConnectionRpcClient> {

    constructor(
        ownPeerDescriptor: PeerDescriptor,
        remotePeerDescriptor: PeerDescriptor,
        serviceId: string,
        client: ProtoRpcClient<ITemporaryConnectionRpcClient>
    ) {
        super(ownPeerDescriptor, remotePeerDescriptor, client, serviceId)
    }

    async openConnection(ownPeerDescriptor: PeerDescriptor): Promise<boolean> {
        const options = this.formDhtRpcOptions(ownPeerDescriptor)
        try {
            const response = await this.client.openConnection({}, options)
            return response.accepted
        } catch (err: any) {
            logger.debug(`temporaryConnection to ${getNodeIdFromPeerDescriptor(this.getPeerDescriptor())} failed: ${err}`)
            return false
        }
    }
}
