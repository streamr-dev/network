import {
    PeerDescriptor,
    WebSocketConnectionRequest
} from '../../proto/DhtRpc'
import { IWebSocketConnectorServiceClient } from '../../proto/DhtRpc.client'
import { DhtRpcOptions } from '../../rpc-protocol/DhtRpcOptions'
import { Logger } from '@streamr/utils'
import * as Err from '../../helpers/errors'
import { ProtoRpcClient } from '@streamr/proto-rpc'

const logger = new Logger(module)

export class RemoteWebSocketConnector {

    private peerDescriptor: PeerDescriptor
    private client: ProtoRpcClient<IWebSocketConnectorServiceClient>

    constructor(peerDescriptor: PeerDescriptor, client: ProtoRpcClient<IWebSocketConnectorServiceClient>) {
        this.peerDescriptor = peerDescriptor
        this.client = client
    }

    async requestConnection(sourceDescriptor: PeerDescriptor, ip: string, port: number): Promise<boolean> {
        logger.trace(`Requesting WebSocket connection from ${this.peerDescriptor.peerId.toString()}`)
        const request: WebSocketConnectionRequest = {
            target: this.peerDescriptor,
            requester: sourceDescriptor,
            ip,
            port
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: sourceDescriptor as PeerDescriptor,
            targetDescriptor: this.peerDescriptor as PeerDescriptor
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
