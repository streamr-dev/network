import { DhtRpcOptions, PeerDescriptor } from '@streamr/dht'
import { ITemporaryConnectionRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { Remote } from '../Remote'
import { TemporaryConnectionRequest } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { Logger, hexToBinary } from '@streamr/utils'
import { getNodeIdFromPeerDescriptor } from '../../identifiers'

const logger = new Logger(module)

export class RemoteTemporaryConnectionRpcServer extends Remote<ITemporaryConnectionRpcClient> {

    async openConnection(ownPeerDescriptor: PeerDescriptor): Promise<boolean> {
        const options: DhtRpcOptions = {
            sourceDescriptor: ownPeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor,
        }
        const request: TemporaryConnectionRequest = {
            senderId: hexToBinary(getNodeIdFromPeerDescriptor(ownPeerDescriptor))
        }
        try {
            const response = await this.client.openConnection(request, options)
            return response.accepted
        } catch (err: any) {
            logger.debug(`temporaryConnection to ${getNodeIdFromPeerDescriptor(this.getPeerDescriptor())} failed: ${err}`)
            return false
        }
    }
}
