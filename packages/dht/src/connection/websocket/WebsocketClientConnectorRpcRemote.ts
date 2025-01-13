import { WebsocketConnectionRequest } from '../../../generated/packages/dht/protos/DhtRpc'
import { Logger } from '@streamr/utils'
import { RpcRemote } from '../../dht/contact/RpcRemote'
import { WebsocketClientConnectorRpcClient } from '../../../generated/packages/dht/protos/DhtRpc.client'
import { toNodeId } from '../../identifiers'

const logger = new Logger(module)

export class WebsocketClientConnectorRpcRemote extends RpcRemote<WebsocketClientConnectorRpcClient> {
    async requestConnection(): Promise<void> {
        logger.trace(`Requesting WebSocket connection from ${toNodeId(this.getLocalPeerDescriptor())}`)
        const request: WebsocketConnectionRequest = {}
        const options = this.formDhtRpcOptions()
        return this.getClient().requestConnection(request, options)
    }
}
