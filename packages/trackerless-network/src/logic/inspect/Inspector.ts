import { PeerDescriptor, ConnectionLocker, LockID, DhtAddress, getNodeIdFromPeerDescriptor, ListeningRpcCommunicator } from '@streamr/dht'
import { MessageID } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { InspectSession, Events as InspectSessionEvents } from './InspectSession'
import { TemporaryConnectionRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { Logger, waitForEvent3 } from '@streamr/utils'
import { TemporaryConnectionRpcRemote } from '../temporary-connection/TemporaryConnectionRpcRemote'
import { StreamPartID } from '@streamr/protocol'

interface InspectorConfig {
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

    constructor(config: InspectorConfig) {
        this.streamPartId = config.streamPartId
        this.localPeerDescriptor = config.localPeerDescriptor
        this.rpcCommunicator = config.rpcCommunicator
        this.connectionLocker = config.connectionLocker
        this.inspectionTimeout = config.inspectionTimeout ?? DEFAULT_TIMEOUT
        this.openInspectConnection = config.openInspectConnection ?? this.defaultOpenInspectConnection
        this.closeInspectConnection = config.closeInspectConnection ?? this.defaultCloseInspectConnection
    }

    async defaultOpenInspectConnection(peerDescriptor: PeerDescriptor, lockId: LockID): Promise<void> {
        const rpcRemote = new TemporaryConnectionRpcRemote(
            this.localPeerDescriptor,
            peerDescriptor,
            this.rpcCommunicator,
            TemporaryConnectionRpcClient
        )
        await rpcRemote.openConnection()
        this.connectionLocker.weakLockConnection(getNodeIdFromPeerDescriptor(peerDescriptor), lockId)
    }

    async defaultCloseInspectConnection(peerDescriptor: PeerDescriptor, lockId: LockID): Promise<void> {
        const rpcRemote = new TemporaryConnectionRpcRemote(
            this.localPeerDescriptor,
            peerDescriptor,
            this.rpcCommunicator,
            TemporaryConnectionRpcClient
        )
        await rpcRemote.closeConnection()
        this.connectionLocker.weakUnlockConnection(getNodeIdFromPeerDescriptor(peerDescriptor), lockId)
    }

    async inspect(peerDescriptor: PeerDescriptor): Promise<boolean> {
        const nodeId = getNodeIdFromPeerDescriptor(peerDescriptor)
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
        } catch (err) {
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
