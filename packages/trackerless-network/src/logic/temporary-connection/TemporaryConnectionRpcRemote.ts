import { RpcRemote, toNodeId } from '@streamr/dht'
import { Logger } from '@streamr/utils'
import { TemporaryConnectionRpcClient } from '../../../generated/packages/trackerless-network/protos/NetworkRpc.client'

const logger = new Logger(module)

export class TemporaryConnectionRpcRemote extends RpcRemote<TemporaryConnectionRpcClient> {
    async openConnection(): Promise<boolean> {
        try {
            const response = await this.getClient().openConnection({}, this.formDhtRpcOptions())
            return response.accepted
        } catch (err: any) {
            logger.debug(`temporaryConnection to ${toNodeId(this.getPeerDescriptor())} failed`, { err })
            return false
        }
    }

    async closeConnection(): Promise<void> {
        try {
            await this.getClient().closeConnection(
                {},
                this.formDhtRpcOptions({
                    connect: false,
                    notification: true
                })
            )
        } catch (err) {
            logger.trace(`closeConnection to ${toNodeId(this.getPeerDescriptor())} failed`, { err })
        }
    }
}
