import { EXISTING_CONNECTION_TIMEOUT, RpcRemote } from '@streamr/dht'
import { Logger, UserID, toUserIdRaw } from '@streamr/utils'
import {
    ProxyConnectionRequest,
    ProxyDirection
} from '../../../generated/packages/trackerless-network/protos/NetworkRpc'
import { ProxyConnectionRpcClient } from '../../../generated/packages/trackerless-network/protos/NetworkRpc.client'

const logger = new Logger(module)

export class ProxyConnectionRpcRemote extends RpcRemote<ProxyConnectionRpcClient> {
    async requestConnection(direction: ProxyDirection, userId: UserID): Promise<boolean> {
        const request: ProxyConnectionRequest = {
            direction,
            userId: toUserIdRaw(userId)
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
