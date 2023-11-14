import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import {
    PeerDescriptor,
    WebsocketConnectionRequest,
    WebsocketConnectionResponse
} from '../../proto/packages/dht/protos/DhtRpc'
import { IWebsocketConnectorRpc } from '../../proto/packages/dht/protos/DhtRpc.server'
import { DhtCallContext } from '../../rpc-protocol/DhtCallContext'
import { ManagedConnection } from '../ManagedConnection'

interface WebsocketConnectorRpcLocalConfig {
    canConnect: (peerDescriptor: PeerDescriptor) => boolean
    connect: (targetPeerDescriptor: PeerDescriptor) => ManagedConnection
    onIncomingConnection: (connection: ManagedConnection) => boolean
}

export class WebsocketConnectorRpcLocal implements IWebsocketConnectorRpc {

    private readonly config: WebsocketConnectorRpcLocalConfig

    constructor(config: WebsocketConnectorRpcLocalConfig) {
        this.config = config
    }

    public async requestConnection(_request: WebsocketConnectionRequest, context: ServerCallContext): Promise<WebsocketConnectionResponse> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        if (this.config.canConnect(senderPeerDescriptor)) {
            setImmediate(() => {
                const connection = this.config.connect(senderPeerDescriptor)
                this.config.onIncomingConnection(connection)
            })
            return { accepted: true }
        } else {
            return { accepted: false }
        }
    }
}
