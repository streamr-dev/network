import { PeerIDKey, PeerDescriptor, keyFromPeerDescriptor, ConnectionLocker } from "@streamr/dht"
import { MessageRef } from "../../proto/packages/trackerless-network/protos/NetworkRpc"
import { InspectSession, Events as InspectSessionEvents } from "./InspectSession"
import { InspectionRpcClient } from "../../proto/packages/trackerless-network/protos/NetworkRpc.client"
import { ProtoRpcClient, RpcCommunicator, toProtoRpcClient } from "@streamr/proto-rpc"
import { Logger, waitForEvent3 } from "@streamr/utils"
import { RemoteInspectionRpcServer } from "./RemoteInspectionRpcServer"

interface InspectorConfig {
    ownPeerDescriptor: PeerDescriptor
    graphId: string
    rpcCommunicator: RpcCommunicator
    connectionLocker: ConnectionLocker
    inspectionTimeout?: number
    openInspectConnection?: (peerDescriptor: PeerDescriptor, lockId: string) => Promise<void>
}

export interface IInspector {
    inspect(peerDescriptor: PeerDescriptor): Promise<boolean>
    markMessage(sender: PeerIDKey, messageId: MessageRef): void
    isInspected(nodeId: PeerIDKey): boolean
    stop(): void
}

const logger = new Logger(module)
const DEFAULT_TIMEOUT = 60 * 1000

export class Inspector implements IInspector {

    private readonly sessions: Map<PeerIDKey, InspectSession> = new Map()
    private readonly graphId: string
    private readonly client: ProtoRpcClient<InspectionRpcClient>
    private readonly ownPeerDescriptor: PeerDescriptor
    private readonly connectionLocker: ConnectionLocker
    private readonly inspectionTimeout: number
    private readonly openInspectConnection: (peerDescriptor: PeerDescriptor, lockId: string) => Promise<void>

    constructor(config: InspectorConfig) {
        this.graphId = config.graphId
        this.ownPeerDescriptor = config.ownPeerDescriptor
        this.client = toProtoRpcClient(new InspectionRpcClient(config.rpcCommunicator.getRpcClientTransport()))
        this.connectionLocker = config.connectionLocker
        this.inspectionTimeout = config.inspectionTimeout ?? DEFAULT_TIMEOUT
        this.openInspectConnection = config.openInspectConnection ?? this.defaultOpenInspectConnection
    }

    async defaultOpenInspectConnection(peerDescriptor: PeerDescriptor, lockId: string): Promise<void> {
        const remoteRandomGraphNode = new RemoteInspectionRpcServer(peerDescriptor, this.graphId, this.client)
        await remoteRandomGraphNode.openInspectConnection(this.ownPeerDescriptor)
        this.connectionLocker.lockConnection(peerDescriptor, lockId)
    }

    async inspect(peerDescriptor: PeerDescriptor): Promise<boolean> {
        const nodeId = keyFromPeerDescriptor(peerDescriptor)
        const session = new InspectSession({
            inspectedPeer: nodeId
        })
        const lockId = `inspector-${this.graphId}`
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

    markMessage(sender: PeerIDKey, messageId: MessageRef): void {
        this.sessions.forEach((session) => session.markMessage(sender, messageId))
    }

    isInspected(nodeId: PeerIDKey): boolean {
        return this.sessions.has(nodeId)
    }

    stop(): void {
        this.sessions.forEach((session) => {
            session.stop()
        })
        this.sessions.clear()
    }

}
