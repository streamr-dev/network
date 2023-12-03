import {
    PeerDescriptor,
    WebsocketConnectionRequest
} from '../../proto/packages/dht/protos/DhtRpc'
import { IWebsocketConnectorRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { Logger } from '@streamr/utils'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { getNodeIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { RpcRemote } from '../../dht/contact/RpcRemote'

const logger = new Logger(module)

export class WebsocketConnectorRpcRemote extends RpcRemote<IWebsocketConnectorRpcClient> {

    constructor(
        localPeerDescriptor: PeerDescriptor,
        remotePeerDescriptor: PeerDescriptor,
        client: ProtoRpcClient<IWebsocketConnectorRpcClient>
    ) {
        super(localPeerDescriptor, remotePeerDescriptor, 'DUMMY', client)
    }

    async requestConnection(ip: string, port: number): Promise<void> {
        logger.trace(`Requesting WebSocket connection from ${getNodeIdFromPeerDescriptor(this.getLocalPeerDescriptor())}`)
        const request: WebsocketConnectionRequest = {
            ip,
            port
        }
        const options = this.formDhtRpcOptions()
        return this.getClient().requestConnection(request, options)
    }
}
