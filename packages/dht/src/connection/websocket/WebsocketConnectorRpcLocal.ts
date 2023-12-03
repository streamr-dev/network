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
    connect: (targetPeerDescriptor: PeerDescriptor) => ManagedConnection
    hasConnection: (targetPeerDescriptor: PeerDescriptor) => boolean
    onNewConnection: (connection: ManagedConnection) => boolean
    abortSignal: AbortSignal
}

export class WebsocketConnectorRpcLocal implements IWebsocketConnectorRpc {

    private readonly config: WebsocketConnectorRpcLocalConfig

    constructor(config: WebsocketConnectorRpcLocalConfig) {
        this.config = config
    }

    public async requestConnection(_request: WebsocketConnectionRequest, context: ServerCallContext): Promise<WebsocketConnectionResponse> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        setImmediate(() => {
            if (this.config.abortSignal.aborted) {
                return
            }
            if (!this.config.hasConnection(senderPeerDescriptor)) {
                const connection = this.config.connect(senderPeerDescriptor)
                this.config.onNewConnection(connection)
            }
        })
        return { accepted: true }
    }
}
