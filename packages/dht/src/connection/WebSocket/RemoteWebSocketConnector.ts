import { PeerDescriptor, WebSocketConnectionRequest } from '../../proto/DhtRpc'
import { IWebSocketConnectorClient } from '../../proto/DhtRpc.client'
import { PeerID } from '../../PeerID'
import { DhtRpcOptions } from '../../transport/ClientTransport'

export class RemoteWebSocketConnector {
    private peerId: PeerID
    constructor(private peerDescriptor: PeerDescriptor, private client: IWebSocketConnectorClient) {
        this.peerId = PeerID.fromValue(peerDescriptor.peerId)
    }

    async requestConnection(sourceDescriptor: PeerDescriptor, ip: string, port: number): Promise<boolean> {
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
        const response = await this.client.requestConnection(request, options)
        const res = await response.response
        if (res.reason) {
            // Log warning?
        }
        return res.accepted
    }
}
