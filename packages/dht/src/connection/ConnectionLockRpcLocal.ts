import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { Logger } from '@streamr/utils'
import { Empty } from '../../generated/google/protobuf/empty'
import {
    DisconnectMode,
    DisconnectNotice,
    LockRequest,
    LockResponse,
    PeerDescriptor,
    UnlockRequest,
    SetPrivateRequest
} from '../../generated/packages/dht/protos/DhtRpc'
import { IConnectionLockRpc } from '../../generated/packages/dht/protos/DhtRpc.server'
import { DhtCallContext } from '../rpc-protocol/DhtCallContext'
import { getNodeIdOrUnknownFromPeerDescriptor } from './ConnectionManager'
import { LockID } from './ConnectionLockStates'
import { DhtAddress, areEqualPeerDescriptors, toNodeId } from '../identifiers'

interface ConnectionLockRpcLocalOptions {
    addRemoteLocked: (id: DhtAddress, lockId: LockID) => void
    removeRemoteLocked: (id: DhtAddress, lockId: LockID) => void
    closeConnection: (peerDescriptor: PeerDescriptor, gracefulLeave: boolean, reason?: string) => Promise<void>
    getLocalPeerDescriptor: () => PeerDescriptor
    setPrivate: (id: DhtAddress, isPrivate: boolean) => void
}

const logger = new Logger(module)

export class ConnectionLockRpcLocal implements IConnectionLockRpc {
    private readonly options: ConnectionLockRpcLocalOptions

    constructor(options: ConnectionLockRpcLocalOptions) {
        this.options = options
    }

    async lockRequest(lockRequest: LockRequest, context: ServerCallContext): Promise<LockResponse> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        if (areEqualPeerDescriptors(senderPeerDescriptor, this.options.getLocalPeerDescriptor())) {
            const response: LockResponse = {
                accepted: false
            }
            return response
        }
        const remoteNodeId = toNodeId(senderPeerDescriptor)
        this.options.addRemoteLocked(remoteNodeId, lockRequest.lockId)
        const response: LockResponse = {
            accepted: true
        }
        return response
    }

    async unlockRequest(unlockRequest: UnlockRequest, context: ServerCallContext): Promise<Empty> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const nodeId = toNodeId(senderPeerDescriptor)
        this.options.removeRemoteLocked(nodeId, unlockRequest.lockId)
        return {}
    }

    async gracefulDisconnect(disconnectNotice: DisconnectNotice, context: ServerCallContext): Promise<Empty> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        logger.trace(getNodeIdOrUnknownFromPeerDescriptor(senderPeerDescriptor) + ' received gracefulDisconnect notice')

        if (disconnectNotice.disconnectMode === DisconnectMode.LEAVING) {
            await this.options.closeConnection(senderPeerDescriptor, true, 'graceful leave notified')
        } else {
            await this.options.closeConnection(senderPeerDescriptor, false, 'graceful disconnect notified')
        }
        return {}
    }

    async setPrivate(request: SetPrivateRequest, context: ServerCallContext): Promise<Empty> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const senderId = toNodeId(senderPeerDescriptor)
        this.options.setPrivate(senderId, request.isPrivate)
        return {}
    }
}
