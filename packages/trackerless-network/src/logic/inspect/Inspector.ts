import { PeerDescriptor, ConnectionLocker } from '@streamr/dht'
import { MessageID } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { InspectSession, Events as InspectSessionEvents } from './InspectSession'
import { TemporaryConnectionRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { ProtoRpcClient, RpcCommunicator, toProtoRpcClient } from '@streamr/proto-rpc'
import { Logger, waitForEvent3 } from '@streamr/utils'
import { RemoteTemporaryConnectionRpcServer } from '../temporary-connection/RemoteTemporaryConnectionRpcServer'
import { NodeID, getNodeIdFromPeerDescriptor } from '../../identifiers'
import { StreamPartID } from '@streamr/protocol'

interface InspectorConfig {
    ownPeerDescriptor: PeerDescriptor
    streamPartId: StreamPartID
    rpcCommunicator: RpcCommunicator
    connectionLocker: ConnectionLocker
    inspectionTimeout?: number
    openInspectConnection?: (peerDescriptor: PeerDescriptor, lockId: string) => Promise<void>
}

export interface IInspector {
    inspect(peerDescriptor: PeerDescriptor): Promise<boolean>
    markMessage(sender: NodeID, messageId: MessageID): void
    isInspected(nodeId: NodeID): boolean
    stop(): void
}

const logger = new Logger(module)
const DEFAULT_TIMEOUT = 60 * 1000

export class Inspector implements IInspector {

    private readonly sessions: Map<NodeID, InspectSession> = new Map()
    private readonly streamPartId: StreamPartID
    private readonly client: ProtoRpcClient<TemporaryConnectionRpcClient>
    private readonly ownPeerDescriptor: PeerDescriptor
    private readonly connectionLocker: ConnectionLocker
    private readonly inspectionTimeout: number
    private readonly openInspectConnection: (peerDescriptor: PeerDescriptor, lockId: string) => Promise<void>

    constructor(config: InspectorConfig) {
        this.streamPartId = config.streamPartId
        this.ownPeerDescriptor = config.ownPeerDescriptor
        this.client = toProtoRpcClient(new TemporaryConnectionRpcClient(config.rpcCommunicator.getRpcClientTransport()))
        this.connectionLocker = config.connectionLocker
        this.inspectionTimeout = config.inspectionTimeout ?? DEFAULT_TIMEOUT
        this.openInspectConnection = config.openInspectConnection ?? this.defaultOpenInspectConnection
    }

    async defaultOpenInspectConnection(peerDescriptor: PeerDescriptor, lockId: string): Promise<void> {
        const remoteRandomGraphNode = new RemoteTemporaryConnectionRpcServer(this.ownPeerDescriptor, peerDescriptor, this.streamPartId, this.client)
        await remoteRandomGraphNode.openConnection()
        this.connectionLocker.lockConnection(peerDescriptor, lockId)
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
            this.sessions.delete(nodeId)
            this.connectionLocker.unlockConnection(peerDescriptor, lockId)
        }
        return success || session.getInspectedMessageCount() < 1
    }

    markMessage(sender: NodeID, messageId: MessageID): void {
        this.sessions.forEach((session) => session.markMessage(sender, messageId))
    }

    isInspected(nodeId: NodeID): boolean {
        return this.sessions.has(nodeId)
    }

    stop(): void {
        this.sessions.forEach((session) => {
            session.stop()
        })
        this.sessions.clear()
    }

}
