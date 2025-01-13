import { ConnectionLocker, DhtAddress, ListeningRpcCommunicator, LockID, PeerDescriptor, toNodeId } from '@streamr/dht'
import { Logger, StreamPartID, waitForEvent3 } from '@streamr/utils'
import { MessageID } from '../../../generated/packages/trackerless-network/protos/NetworkRpc'
import { TemporaryConnectionRpcClient } from '../../../generated/packages/trackerless-network/protos/NetworkRpc.client'
import { TemporaryConnectionRpcRemote } from '../temporary-connection/TemporaryConnectionRpcRemote'
import { InspectSession, Events as InspectSessionEvents } from './InspectSession'

interface InspectorOptions {
    localPeerDescriptor: PeerDescriptor
    streamPartId: StreamPartID
    rpcCommunicator: ListeningRpcCommunicator
    connectionLocker: ConnectionLocker
    inspectionTimeout?: number
    openInspectConnection?: (peerDescriptor: PeerDescriptor, lockId: LockID) => Promise<void>
    closeInspectConnection?: (peerDescriptor: PeerDescriptor, lockId: LockID) => Promise<void>
}

const logger = new Logger(module)
const DEFAULT_TIMEOUT = 60 * 1000

export class Inspector {
    private readonly sessions: Map<DhtAddress, InspectSession> = new Map()
    private readonly streamPartId: StreamPartID
    private readonly localPeerDescriptor: PeerDescriptor
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly connectionLocker: ConnectionLocker
    private readonly inspectionTimeout: number
    private readonly openInspectConnection: (peerDescriptor: PeerDescriptor, lockId: LockID) => Promise<void>
    private readonly closeInspectConnection: (peerDescriptor: PeerDescriptor, lockId: LockID) => Promise<void>

    constructor(options: InspectorOptions) {
        this.streamPartId = options.streamPartId
        this.localPeerDescriptor = options.localPeerDescriptor
        this.rpcCommunicator = options.rpcCommunicator
        this.connectionLocker = options.connectionLocker
        this.inspectionTimeout = options.inspectionTimeout ?? DEFAULT_TIMEOUT
        this.openInspectConnection = options.openInspectConnection ?? this.defaultOpenInspectConnection
        this.closeInspectConnection = options.closeInspectConnection ?? this.defaultCloseInspectConnection
    }

    async defaultOpenInspectConnection(peerDescriptor: PeerDescriptor, lockId: LockID): Promise<void> {
        const rpcRemote = new TemporaryConnectionRpcRemote(
            this.localPeerDescriptor,
            peerDescriptor,
            this.rpcCommunicator,
            TemporaryConnectionRpcClient
        )
        await rpcRemote.openConnection()
        this.connectionLocker.weakLockConnection(toNodeId(peerDescriptor), lockId)
    }

    async defaultCloseInspectConnection(peerDescriptor: PeerDescriptor, lockId: LockID): Promise<void> {
        const rpcRemote = new TemporaryConnectionRpcRemote(
            this.localPeerDescriptor,
            peerDescriptor,
            this.rpcCommunicator,
            TemporaryConnectionRpcClient
        )
        await rpcRemote.closeConnection()
        this.connectionLocker.weakUnlockConnection(toNodeId(peerDescriptor), lockId)
    }

    async inspect(peerDescriptor: PeerDescriptor): Promise<boolean> {
        const nodeId = toNodeId(peerDescriptor)
        const session = new InspectSession({
            inspectedNode: nodeId
        })
        const lockId = `inspector-${this.streamPartId}`
        this.sessions.set(nodeId, session)
        await this.openInspectConnection(peerDescriptor, lockId)
        let success = false
        try {
            await waitForEvent3<InspectSessionEvents>(session, 'done', this.inspectionTimeout)
            success = true
        } catch {
            logger.trace('Inspect session timed out, removing')
        } finally {
            await this.closeInspectConnection(peerDescriptor, lockId)
            this.sessions.delete(nodeId)
        }
        return success || session.getInspectedMessageCount() < 1 || session.onlyMarkedByInspectedNode()
    }

    markMessage(sender: DhtAddress, messageId: MessageID): void {
        this.sessions.forEach((session) => session.markMessage(sender, messageId))
    }

    isInspected(nodeId: DhtAddress): boolean {
        return this.sessions.has(nodeId)
    }

    stop(): void {
        this.sessions.forEach((session) => {
            session.stop()
        })
        this.sessions.clear()
    }
}
