import {
    PeerDescriptor,
    WebSocketConnectionRequest
} from '../../proto/DhtRpc'
import { IWebSocketConnectorClient } from '../../proto/DhtRpc.client'
import { PeerID } from '../../helpers/PeerID'
import { DhtRpcOptions } from '../../rpc-protocol/ClientTransport'
import { Logger } from '../../helpers/Logger'

const logger = new Logger(module)

export class RemoteWebSocketConnector {
    private peerId: PeerID
    constructor(private peerDescriptor: PeerDescriptor, private client: IWebSocketConnectorClient) {
        this.peerId = PeerID.fromValue(peerDescriptor.peerId)
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
            const response = await this.client.requestConnection(request, options)
            const res = await response.response
            if (res.reason) {
                // Log warning?
            }
            return res.accepted
        } catch (err) {
            logger.debug(err)
            return false
        }
    }
}
