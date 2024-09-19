import { EXISTING_CONNECTION_TIMEOUT, RpcRemote, UserID } from '@streamr/dht'
import { Logger } from '@streamr/utils'
import { ProxyConnectionRequest, ProxyDirection } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { ProxyConnectionRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'

const logger = new Logger(module)

export class ProxyConnectionRpcRemote extends RpcRemote<ProxyConnectionRpcClient> {

    async requestConnection(direction: ProxyDirection, userId: UserID): Promise<boolean> {
        const request: ProxyConnectionRequest = {
            direction,
            userId
        }
        const options = this.formDhtRpcOptions({
            timeout: EXISTING_CONNECTION_TIMEOUT
        })
        try {
            const res = await this.getClient().requestConnection(request, options)
            return res.accepted
        } catch (err) {
            logger.debug(`ProxyConnectionRequest failed with error`, { err })
            return false
        }
    }
}
