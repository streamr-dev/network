import { Remote } from '@streamr/dht'
import { Logger } from '@streamr/utils'
import { getNodeIdFromPeerDescriptor } from '../../identifiers'
import { ITemporaryConnectionRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'

const logger = new Logger(module)

export class RemoteTemporaryConnectionRpcServer extends Remote<ITemporaryConnectionRpcClient> {

    async openConnection(): Promise<boolean> {
        try {
            const response = await this.client.openConnection({}, this.formDhtRpcOptions())
            return response.accepted
        } catch (err: any) {
            logger.debug(`temporaryConnection to ${getNodeIdFromPeerDescriptor(this.getPeerDescriptor())} failed: ${err}`)
            return false
        }
    }
}
