import { DhtRpcOptions, keyFromPeerDescriptor } from "@streamr/dht"
import { PeerDescriptor } from "../../proto/packages/dht/protos/DhtRpc"
import { IProxyConnectionRpcClient } from "../../proto/packages/trackerless-network/protos/NetworkRpc.client"
import { Remote } from "../Remote"
import { StreamPartIDUtils, toStreamID } from "@streamr/protocol"
import { ProxyDirection, ProxyConnectionRequest } from "../../proto/packages/trackerless-network/protos/NetworkRpc"
import { Logger } from "@streamr/utils"

const logger = new Logger(module)

export class RemoteProxyServer extends Remote<IProxyConnectionRpcClient> {

    async requestConnection(ownPeerDescriptor: PeerDescriptor, direction: ProxyDirection, userId: string): Promise<boolean> {
        const streamPartId = StreamPartIDUtils.parse(this.graphId)
        const options: DhtRpcOptions = {
            sourceDescriptor: ownPeerDescriptor as PeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor as PeerDescriptor,
            timeout: 5000
        }
        const request: ProxyConnectionRequest = {
            senderId: keyFromPeerDescriptor(ownPeerDescriptor),
            senderDescriptor: ownPeerDescriptor,
            streamId: toStreamID(streamPartId),
            streamPartition: StreamPartIDUtils.getStreamPartition(streamPartId),
            direction,
            userId
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
