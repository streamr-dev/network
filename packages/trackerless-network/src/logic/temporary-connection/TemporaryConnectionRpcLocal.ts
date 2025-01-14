import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { ConnectionLocker, DhtAddress, DhtCallContext, ListeningRpcCommunicator, toNodeId } from '@streamr/dht'
import { StreamPartID } from '@streamr/utils'
import { Empty } from '../../../generated/google/protobuf/empty'
import { PeerDescriptor } from '../../../generated/packages/dht/protos/DhtRpc'
import {
    CloseTemporaryConnection,
    TemporaryConnectionRequest,
    TemporaryConnectionResponse
} from '../../../generated/packages/trackerless-network/protos/NetworkRpc'
import { ContentDeliveryRpcClient } from '../../../generated/packages/trackerless-network/protos/NetworkRpc.client'
import { ITemporaryConnectionRpc } from '../../../generated/packages/trackerless-network/protos/NetworkRpc.server'
import { ContentDeliveryRpcRemote } from '../ContentDeliveryRpcRemote'
import { NodeList } from '../NodeList'

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
        this.temporaryNodes = new NodeList(toNodeId(options.localPeerDescriptor), 10)
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
        this.options.connectionLocker.weakLockConnection(toNodeId(sender), this.lockId)
        return {
            accepted: true
        }
    }

    async closeConnection(_request: CloseTemporaryConnection, context: ServerCallContext): Promise<Empty> {
        const remoteNodeId = toNodeId((context as DhtCallContext).incomingSourceDescriptor!)
        this.removeNode(remoteNodeId)
        return {}
    }
}
