import {
    PeerDescriptor,
    WebsocketConnectionRequest
} from '../../proto/packages/dht/protos/DhtRpc'
import { IWebsocketConnectorRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { Logger } from '@streamr/utils'
import * as Err from '../../helpers/errors'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
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

    async requestConnection(ip: string, port: number): Promise<boolean> {
        logger.trace(`Requesting WebSocket connection from ${keyFromPeerDescriptor(this.getLocalPeerDescriptor())}`)
        const request: WebsocketConnectionRequest = {
            ip,
            port
        }
        const options = this.formDhtRpcOptions()
        try {
            const res = await this.getClient().requestConnection(request, options)
            return res.accepted
        } catch (err) {
            logger.debug(new Err.WebsocketConnectionRequestRejected('WebsocketConnectionRequest rejected', err).stack!)
            return false
        }
    }
}
