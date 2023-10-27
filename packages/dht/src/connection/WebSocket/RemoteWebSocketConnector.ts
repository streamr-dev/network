import {
    PeerDescriptor,
    WebSocketConnectionRequest
} from '../../proto/packages/dht/protos/DhtRpc'
import { IWebSocketConnectorRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { DhtRpcOptions } from '../../rpc-protocol/DhtRpcOptions'
import { Logger } from '@streamr/utils'
import * as Err from '../../helpers/errors'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'

const logger = new Logger(module)

export class RemoteWebSocketConnector {

    private peerDescriptor: PeerDescriptor
    private client: ProtoRpcClient<IWebSocketConnectorRpcClient>

    constructor(peerDescriptor: PeerDescriptor, client: ProtoRpcClient<IWebSocketConnectorRpcClient>) {
        this.peerDescriptor = peerDescriptor
        this.client = client
    }

    async requestConnection(sourceDescriptor: PeerDescriptor, ip: string, port: number): Promise<boolean> {
        logger.trace(`Requesting WebSocket connection from ${keyFromPeerDescriptor(this.peerDescriptor)}`)
        const request: WebSocketConnectionRequest = {
            target: this.peerDescriptor,
            requester: sourceDescriptor,
            ip,
            port
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: sourceDescriptor,
            targetDescriptor: this.peerDescriptor 
        }
        try {
            const res = await this.client.requestConnection(request, options)
            
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
