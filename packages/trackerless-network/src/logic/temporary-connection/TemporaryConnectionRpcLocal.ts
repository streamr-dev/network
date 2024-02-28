import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { 
    CloseTemporaryConnection,
    TemporaryConnectionRequest,
    TemporaryConnectionResponse
} from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { ITemporaryConnectionRpc } from '../../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { ConnectionLocker, DhtAddress, DhtCallContext, ListeningRpcCommunicator, getNodeIdFromPeerDescriptor } from '@streamr/dht'
import { DeliveryRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { NodeList } from '../NodeList'
import { DeliveryRpcRemote } from '../DeliveryRpcRemote'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { Empty } from '../../proto/google/protobuf/empty'
import { StreamPartID } from '@streamr/protocol'

interface TemporaryConnectionRpcLocalConfig {
    rpcCommunicator: ListeningRpcCommunicator
    localPeerDescriptor: PeerDescriptor
    streamPartId: StreamPartID
    connectionLocker: ConnectionLocker
} 

const LOCK_ID_BASE = 'system/delivery/temporary-connection/'

export class TemporaryConnectionRpcLocal implements ITemporaryConnectionRpc {

    private readonly config: TemporaryConnectionRpcLocalConfig
    private readonly temporaryNodes: NodeList
    private readonly lockId: string
    constructor(config: TemporaryConnectionRpcLocalConfig) {
        this.config = config
        // TODO use config option or named constant?
        this.temporaryNodes = new NodeList(getNodeIdFromPeerDescriptor(config.localPeerDescriptor), 10)
        this.lockId = LOCK_ID_BASE + config.streamPartId
    }

    getNodes(): NodeList {
        return this.temporaryNodes
    }

    hasNode(node: DhtAddress): boolean {
        return this.temporaryNodes.has(node)
    }

    removeNode(nodeId: DhtAddress): void {
        this.temporaryNodes.remove(nodeId)
        this.config.connectionLocker.weakUnlockConnection(nodeId, this.lockId)
    }

    async openConnection(
        _request: TemporaryConnectionRequest,
        context: ServerCallContext
    ): Promise<TemporaryConnectionResponse> {
        const sender = (context as DhtCallContext).incomingSourceDescriptor!
        const remote = new DeliveryRpcRemote(
            this.config.localPeerDescriptor,
            sender,
            this.config.rpcCommunicator,
            DeliveryRpcClient
        )
        this.temporaryNodes.add(remote)
        this.config.connectionLocker.weakLockConnection(getNodeIdFromPeerDescriptor(sender), this.lockId)
        return {
            accepted: true
        }
    }

    async closeConnection(_request: CloseTemporaryConnection, context: ServerCallContext): Promise<Empty> {
        const senderId = getNodeIdFromPeerDescriptor((context as DhtCallContext).incomingSourceDescriptor!)
        this.removeNode(senderId)
        return {}
    }
}
