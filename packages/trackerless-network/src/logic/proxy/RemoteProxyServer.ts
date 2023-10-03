import { PeerDescriptor, Remote } from '@streamr/dht'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { EthereumAddress, Logger, hexToBinary } from '@streamr/utils'
import { ProxyConnectionRequest, ProxyDirection } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { IProxyConnectionRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'

const logger = new Logger(module)

export class RemoteProxyServer extends Remote<IProxyConnectionRpcClient> {

    constructor(
        ownPeerDescriptor: PeerDescriptor,
        remotePeerDescriptor: PeerDescriptor,
        serviceId: string,
        client: ProtoRpcClient<IProxyConnectionRpcClient>
    ) {
        super(ownPeerDescriptor, remotePeerDescriptor, client, serviceId)
    }

    async requestConnection(ownPeerDescriptor: PeerDescriptor, direction: ProxyDirection, userId: EthereumAddress): Promise<boolean> {
        const options = this.formDhtRpcOptions(ownPeerDescriptor, {
            timeout: 5000
        })
        const request: ProxyConnectionRequest = {
            direction,
            userId: hexToBinary(userId)
        }
        try {
            const res = await this.client.requestConnection(request, options)
            return res.accepted
        } catch (err) {
            logger.warn(`ProxyConnectionRequest failed with error: ${err}`)
            return false
        }
    }
}
