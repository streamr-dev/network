import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { Logger } from '@streamr/utils'
import {
    areEqualPeerDescriptors,
    getNodeIdFromPeerDescriptor
} from '../helpers/peerIdFromPeerDescriptor'
import { Empty } from '../proto/google/protobuf/empty'
import {
    DisconnectMode,
    DisconnectNotice,
    LockRequest,
    LockResponse,
    PeerDescriptor,
    UnlockRequest
} from '../proto/packages/dht/protos/DhtRpc'
import { IConnectionLockRpc } from '../proto/packages/dht/protos/DhtRpc.server'
import { DhtCallContext } from '../rpc-protocol/DhtCallContext'
import { getNodeIdOrUnknownFromPeerDescriptor } from './ConnectionManager'
import { LockID } from './ConnectionLockHandler'
import { NodeID } from '../helpers/nodeId'

interface ConnectionLockRpcLocalConfig {
    addRemoteLocked: (id: NodeID, lockId: LockID) => void
    removeRemoteLocked: (id: NodeID, lockId: LockID) => void
    closeConnection: (peerDescriptor: PeerDescriptor, gracefulLeave: boolean, reason?: string) => void
    getLocalPeerDescriptor: () => PeerDescriptor
}

const logger = new Logger(module)

export class ConnectionLockRpcLocal implements IConnectionLockRpc {

    private readonly config: ConnectionLockRpcLocalConfig

    constructor(config: ConnectionLockRpcLocalConfig) {
        this.config = config
    }

    async lockRequest(lockRequest: LockRequest, context: ServerCallContext): Promise<LockResponse> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        if (areEqualPeerDescriptors(senderPeerDescriptor, this.config.getLocalPeerDescriptor())) {
            const response: LockResponse = {
                accepted: false
            }
            return response
        }
        const remoteNodeId = getNodeIdFromPeerDescriptor(senderPeerDescriptor)
        this.config.addRemoteLocked(remoteNodeId, lockRequest.lockId)
        const response: LockResponse = {
            accepted: true
        }
        return response
    }

    async unlockRequest(unlockRequest: UnlockRequest, context: ServerCallContext): Promise<Empty> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const nodeId = getNodeIdFromPeerDescriptor(senderPeerDescriptor)
        this.config.removeRemoteLocked(nodeId, unlockRequest.lockId)
        return {}
    }

    async gracefulDisconnect(disconnectNotice: DisconnectNotice, context: ServerCallContext): Promise<Empty> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        logger.trace(getNodeIdOrUnknownFromPeerDescriptor(senderPeerDescriptor) + ' received gracefulDisconnect notice')

        if (disconnectNotice.disconnectMode === DisconnectMode.LEAVING) {
            this.config.closeConnection(senderPeerDescriptor, true, 'graceful leave notified')
        } else {
            this.config.closeConnection(senderPeerDescriptor, false, 'graceful disconnect notified')
        }
        return {}
    }
}
