import { Remote } from '@streamr/dht'
import { EthereumAddress, Logger, hexToBinary } from '@streamr/utils'
import { ProxyConnectionRequest, ProxyDirection } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { IProxyConnectionRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'

const logger = new Logger(module)

export class RemoteProxyServer extends Remote<IProxyConnectionRpcClient> {

    async requestConnection(direction: ProxyDirection, userId: EthereumAddress): Promise<boolean> {
        const request: ProxyConnectionRequest = {
            direction,
            userId: hexToBinary(userId)
        }
        const options = this.formDhtRpcOptions({
            timeout: 5000
        })
        try {
            const res = await this.client.requestConnection(request, options)
            return res.accepted
        } catch (err) {
            logger.warn(`ProxyConnectionRequest failed with error: ${err}`)
            return false
        }
    }
}
