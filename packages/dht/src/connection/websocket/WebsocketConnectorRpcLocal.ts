import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import {
    PeerDescriptor,
    WebsocketConnectionRequest
} from '../../proto/packages/dht/protos/DhtRpc'
import { IWebsocketConnectorRpc } from '../../proto/packages/dht/protos/DhtRpc.server'
import { DhtCallContext } from '../../rpc-protocol/DhtCallContext'
import { ManagedConnection } from '../ManagedConnection'
import { Empty } from '../../proto/google/protobuf/empty'
import { getNodeIdFromPeerDescriptor } from '../../identifiers'
import { DhtAddress } from '../../identifiers'

interface WebsocketConnectorRpcLocalConfig {
    connect: (targetPeerDescriptor: PeerDescriptor) => ManagedConnection
    hasConnection: (nodeId: DhtAddress) => boolean
    onNewConnection: (connection: ManagedConnection) => boolean
    abortSignal: AbortSignal
}

export class WebsocketConnectorRpcLocal implements IWebsocketConnectorRpc {

    private readonly config: WebsocketConnectorRpcLocalConfig

    constructor(config: WebsocketConnectorRpcLocalConfig) {
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
