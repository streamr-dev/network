import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import {
    PeerDescriptor,
    WebsocketConnectionRequest
} from '../../proto/packages/dht/protos/DhtRpc'
import { IWebsocketClientConnectorRpc } from '../../proto/packages/dht/protos/DhtRpc.server'
import { DhtCallContext } from '../../rpc-protocol/DhtCallContext'
import { Empty } from '../../proto/google/protobuf/empty'
import { getNodeIdFromPeerDescriptor } from '../../identifiers'
import { DhtAddress } from '../../identifiers'
import { PendingConnection } from '../PendingConnection'

interface WebsocketClientConnectorRpcLocalConfig {
    connect: (targetPeerDescriptor: PeerDescriptor) => PendingConnection
    hasConnection: (nodeId: DhtAddress) => boolean
    onNewConnection: (connection: PendingConnection) => boolean
    abortSignal: AbortSignal
}

export class WebsocketClientConnectorRpcLocal implements IWebsocketClientConnectorRpc {

    private readonly config: WebsocketClientConnectorRpcLocalConfig

    constructor(config: WebsocketClientConnectorRpcLocalConfig) {
        this.config = config
    }

    public async requestConnection(_request: WebsocketConnectionRequest, context: ServerCallContext): Promise<Empty> {
        if (this.config.abortSignal.aborted) {
            return {}
        }
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        if (!this.config.hasConnection(getNodeIdFromPeerDescriptor(senderPeerDescriptor))) {
            const connection = this.config.connect(senderPeerDescriptor)
            this.config.onNewConnection(connection)
        }
        return {}
    }
}
