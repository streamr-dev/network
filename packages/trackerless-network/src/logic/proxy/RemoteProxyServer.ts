import { DhtRpcOptions } from '@streamr/dht'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { IProxyConnectionRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { Remote } from '../Remote'
import { StreamPartIDUtils, toStreamID } from '@streamr/protocol'
import { ProxyDirection, ProxyConnectionRequest } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { EthereumAddress, Logger, hexToBinary } from '@streamr/utils'
import { getNodeIdFromPeerDescriptor } from '../../identifiers'

const logger = new Logger(module)

export class RemoteProxyServer extends Remote<IProxyConnectionRpcClient> {

    async requestConnection(ownPeerDescriptor: PeerDescriptor, direction: ProxyDirection, userId: EthereumAddress): Promise<boolean> {
        const streamPartId = StreamPartIDUtils.parse(this.serviceId)
        const options: DhtRpcOptions = {
            sourceDescriptor: ownPeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor,
            timeout: 5000
        }
        const request: ProxyConnectionRequest = {
            senderId: hexToBinary(getNodeIdFromPeerDescriptor(ownPeerDescriptor)),
            senderDescriptor: ownPeerDescriptor,
            streamId: toStreamID(streamPartId),
            streamPartition: StreamPartIDUtils.getStreamPartition(streamPartId),
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
