import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { Logger } from '@streamr/utils'
import {
    areEqualPeerDescriptors,
    keyFromPeerDescriptor,
    peerIdFromPeerDescriptor
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
import { PeerIDKey } from '../helpers/PeerID'
import { keyOrUnknownFromPeerDescriptor } from './ConnectionManager'
import { DisconnectionType } from '../transport/ITransport'
import { LockID } from './ConnectionLockHandler'

interface ConnectionLockRpcLocalConfig {
    addRemoteLocked: (id: PeerIDKey, lockId: LockID) => void
    removeRemoteLocked: (id: PeerIDKey, lockId: LockID) => void
    closeConnection: (peerDescriptor: PeerDescriptor, disconnectionType: DisconnectionType, reason?: string) => void
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
        const remotePeerId = peerIdFromPeerDescriptor(senderPeerDescriptor)
        if (areEqualPeerDescriptors(senderPeerDescriptor, this.config.getLocalPeerDescriptor())) {
            const response: LockResponse = {
                accepted: false
            }
            return response
        }
        this.config.addRemoteLocked(remotePeerId.toKey(), lockRequest.lockId)
        const response: LockResponse = {
            accepted: true
        }
        return response
    }

    async unlockRequest(unlockRequest: UnlockRequest, context: ServerCallContext): Promise<Empty> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const peerIdKey = keyFromPeerDescriptor(senderPeerDescriptor)
        this.config.removeRemoteLocked(peerIdKey, unlockRequest.lockId)
        return {}
    }

    async gracefulDisconnect(disconnectNotice: DisconnectNotice, context: ServerCallContext): Promise<Empty> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        logger.trace(keyOrUnknownFromPeerDescriptor(senderPeerDescriptor) + ' received gracefulDisconnect notice')

        if (disconnectNotice.disconnectMode === DisconnectMode.LEAVING) {
            this.config.closeConnection(senderPeerDescriptor, 'GRACEFUL_LEAVE', 'graceful leave notified')
        } else {
            this.config.closeConnection(senderPeerDescriptor, 'GRACEFUL_DISCONNECT', 'graceful disconnect notified')
        }
        return {}
    }
}
