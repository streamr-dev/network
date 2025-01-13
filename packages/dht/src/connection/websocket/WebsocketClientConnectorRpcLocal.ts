import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { PeerDescriptor, WebsocketConnectionRequest } from '../../../generated/packages/dht/protos/DhtRpc'
import { IWebsocketClientConnectorRpc } from '../../../generated/packages/dht/protos/DhtRpc.server'
import { DhtCallContext } from '../../rpc-protocol/DhtCallContext'
import { Empty } from '../../../generated/google/protobuf/empty'
import { toNodeId, DhtAddress } from '../../identifiers'
import { PendingConnection } from '../PendingConnection'

interface WebsocketClientConnectorRpcLocalOptions {
    connect: (targetPeerDescriptor: PeerDescriptor) => PendingConnection
    hasConnection: (nodeId: DhtAddress) => boolean
    onNewConnection: (connection: PendingConnection) => boolean
    abortSignal: AbortSignal
}

export class WebsocketClientConnectorRpcLocal implements IWebsocketClientConnectorRpc {
    private readonly options: WebsocketClientConnectorRpcLocalOptions

    constructor(options: WebsocketClientConnectorRpcLocalOptions) {
        this.options = options
    }

    public async requestConnection(_request: WebsocketConnectionRequest, context: ServerCallContext): Promise<Empty> {
        if (this.options.abortSignal.aborted) {
            return {}
        }
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        if (!this.options.hasConnection(toNodeId(senderPeerDescriptor))) {
            const connection = this.options.connect(senderPeerDescriptor)
            this.options.onNewConnection(connection)
        }
        return {}
    }
}
