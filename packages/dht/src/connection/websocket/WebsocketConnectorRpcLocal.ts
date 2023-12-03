import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import {
    PeerDescriptor,
    WebsocketConnectionRequest
} from '../../proto/packages/dht/protos/DhtRpc'
import { IWebsocketConnectorRpc } from '../../proto/packages/dht/protos/DhtRpc.server'
import { DhtCallContext } from '../../rpc-protocol/DhtCallContext'
import { ManagedConnection } from '../ManagedConnection'
import { Empty } from '../../proto/google/protobuf/empty'

interface WebsocketConnectorRpcLocalConfig {
    connect: (targetPeerDescriptor: PeerDescriptor) => ManagedConnection
    onNewConnection: (connection: ManagedConnection) => boolean
    abortSignal: AbortSignal
}

export class WebsocketConnectorRpcLocal implements IWebsocketConnectorRpc {

    private readonly config: WebsocketConnectorRpcLocalConfig

    constructor(config: WebsocketConnectorRpcLocalConfig) {
        this.config = config
    }

    public async requestConnection(_request: WebsocketConnectionRequest, context: ServerCallContext): Promise<Empty> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        setImmediate(() => {
            if (this.config.abortSignal.aborted) {
                return
            }
            const connection = this.config.connect(senderPeerDescriptor)
            this.config.onNewConnection(connection)
        })
        return {}
    }
}
