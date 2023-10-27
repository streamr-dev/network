import {
    PeerDescriptor,
    WebSocketConnectionRequest
} from '../../proto/packages/dht/protos/DhtRpc'
import { IWebSocketConnectorRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { Logger } from '@streamr/utils'
import * as Err from '../../helpers/errors'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { Remote } from '../../dht/contact/Remote'

const logger = new Logger(module)

export class WebSocketConnectorRpcRemote extends Remote<IWebSocketConnectorRpcClient> {

    constructor(
        localPeerDescriptor: PeerDescriptor,
        remotePeerDescriptor: PeerDescriptor,
        client: ProtoRpcClient<IWebSocketConnectorRpcClient>
    ) {
        super(localPeerDescriptor, remotePeerDescriptor, 'DUMMY', client)
    }

    async requestConnection(ip: string, port: number): Promise<boolean> {
        logger.trace(`Requesting WebSocket connection from ${keyFromPeerDescriptor(this.getLocalPeerDescriptor())}`)
        const request: WebSocketConnectionRequest = {
            target: this.getPeerDescriptor(),
            requester: this.getLocalPeerDescriptor(),
            ip,
            port
        }
        const options = this.formDhtRpcOptions()
        try {
            const res = await this.getClient().requestConnection(request, options)
            
            if (res.reason) {
                logger.debug('WebSocketConnectionRequest Rejected', {
                    stack: new Err.WebSocketConnectionRequestRejected(res.reason).stack
                })
            }
            return res.accepted
        } catch (err) {
            logger.debug(new Err.WebSocketConnectionRequestRejected('WebSocketConnectionRequest rejected', err).stack!)
            return false
        }
    }
}
