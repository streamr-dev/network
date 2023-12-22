import {
    WebsocketConnectionRequest
} from '../../proto/packages/dht/protos/DhtRpc'
import { Logger } from '@streamr/utils'
import { getNodeIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { RpcRemote } from '../../dht/contact/RpcRemote'
import { WebsocketConnectorRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'

const logger = new Logger(module)

export class WebsocketConnectorRpcRemote extends RpcRemote<WebsocketConnectorRpcClient> {

    async requestConnection(): Promise<void> {
        logger.trace(`Requesting WebSocket connection from ${getNodeIdFromPeerDescriptor(this.getLocalPeerDescriptor())}`)
        const request: WebsocketConnectionRequest = {}
        const options = this.formDhtRpcOptions()
        return this.getClient().requestConnection(request, options)
    }
}
