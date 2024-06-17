import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { 
    CloseTemporaryConnection,
    TemporaryConnectionRequest,
    TemporaryConnectionResponse
} from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { ITemporaryConnectionRpc } from '../../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { ConnectionLocker, DhtAddress, DhtCallContext, ListeningRpcCommunicator, getNodeIdFromPeerDescriptor } from '@streamr/dht'
import { ContentDeliveryRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { NodeList } from '../NodeList'
import { ContentDeliveryRpcRemote } from '../ContentDeliveryRpcRemote'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { Empty } from '../../proto/google/protobuf/empty'
import { StreamPartID } from '@streamr/protocol'

interface TemporaryConnectionRpcLocalOptions {
    rpcCommunicator: ListeningRpcCommunicator
    localPeerDescriptor: PeerDescriptor
    streamPartId: StreamPartID
    connectionLocker: ConnectionLocker
} 

const LOCK_ID_BASE = 'system/content-delivery/temporary-connection/'

export class TemporaryConnectionRpcLocal implements ITemporaryConnectionRpc {

    private readonly options: TemporaryConnectionRpcLocalOptions
    private readonly temporaryNodes: NodeList
    private readonly lockId: string
    constructor(options: TemporaryConnectionRpcLocalOptions) {
        this.options = options
        // TODO use options option or named constant?
        this.temporaryNodes = new NodeList(getNodeIdFromPeerDescriptor(options.localPeerDescriptor), 10)
        this.lockId = LOCK_ID_BASE + options.streamPartId
    }

    getNodes(): NodeList {
        return this.temporaryNodes
    }

    hasNode(node: DhtAddress): boolean {
        return this.temporaryNodes.has(node)
    }

    removeNode(nodeId: DhtAddress): void {
        this.temporaryNodes.remove(nodeId)
        this.options.connectionLocker.weakUnlockConnection(nodeId, this.lockId)
    }

    async openConnection(
        _request: TemporaryConnectionRequest,
        context: ServerCallContext
    ): Promise<TemporaryConnectionResponse> {
        const sender = (context as DhtCallContext).incomingSourceDescriptor!
        const remote = new ContentDeliveryRpcRemote(
            this.options.localPeerDescriptor,
            sender,
            this.options.rpcCommunicator,
            ContentDeliveryRpcClient
        )
        this.temporaryNodes.add(remote)
        this.options.connectionLocker.weakLockConnection(getNodeIdFromPeerDescriptor(sender), this.lockId)
        return {
            accepted: true
        }
    }

    async closeConnection(_request: CloseTemporaryConnection, context: ServerCallContext): Promise<Empty> {
        const remoteNodeId = getNodeIdFromPeerDescriptor((context as DhtCallContext).incomingSourceDescriptor!)
        this.removeNode(remoteNodeId)
        return {}
    }
}
