import { PeerIDKey, PeerDescriptor, keyFromPeerDescriptor, peerIdFromPeerDescriptor, ConnectionLocker } from "@streamr/dht"
import { MessageRef } from "../../proto/packages/trackerless-network/protos/NetworkRpc"
import { InspectSession, Events as InspectSessionEvents } from "./InspectSession"
import { PeerList } from "../PeerList"
import { RemoteHandshaker } from "../neighbor-discovery/RemoteHandshaker"
import { IHandshakeRpcClient, HandshakeRpcClient } from "../../proto/packages/trackerless-network/protos/NetworkRpc.client"
import { ProtoRpcClient, RpcCommunicator, toProtoRpcClient } from "@streamr/proto-rpc"
import { Logger, waitForEvent3 } from "@streamr/utils"

interface InspectorConfig {
    neighbors: PeerList
    ownPeerDescriptor: PeerDescriptor
    graphId: string
    rpcCommunicator: RpcCommunicator
    connectionLocker: ConnectionLocker
}

export interface IInspector {
    inspect(peerDescriptor: PeerDescriptor): Promise<boolean>
    markMessage(sender: PeerIDKey, messageId: MessageRef): void
    isInspected(nodeId: PeerIDKey): boolean
    stop(): void
}

const logger = new Logger(module)

export class Inspector {

    private readonly sessions: Map<PeerIDKey, InspectSession> = new Map()
    private readonly neighbors: PeerList
    private readonly graphId: string
    private readonly client: ProtoRpcClient<IHandshakeRpcClient>
    private readonly ownPeerDescriptor: PeerDescriptor
    private readonly connectionLocker: ConnectionLocker

    private readonly inspectorConnections: PeerList

    constructor(config: InspectorConfig) {
        this.inspectorConnections = new PeerList(peerIdFromPeerDescriptor(config.ownPeerDescriptor), 10)
        this.neighbors = config.neighbors
        this.graphId = config.graphId
        this.ownPeerDescriptor = config.ownPeerDescriptor
        this.client = toProtoRpcClient(new HandshakeRpcClient(config.rpcCommunicator.getRpcClientTransport()))
        this.connectionLocker = config.connectionLocker
    }

    async inspect(peerDescriptor: PeerDescriptor): Promise<boolean> {
        const nodeId = keyFromPeerDescriptor(peerDescriptor)
        const session = new InspectSession({
            inspectedPeer: nodeId
        })
        this.sessions.set(nodeId, session)
        if (!this.neighbors.hasPeerWithStringId(nodeId)) {
            const remoteHandshaker = new RemoteHandshaker(peerDescriptor, this.graphId, this.client)
            await remoteHandshaker.handshake(this.ownPeerDescriptor, this.neighbors.getStringIds(), [])
            this.connectionLocker.lockConnection(peerDescriptor, this.graphId)
        }
        try {
            await waitForEvent3<InspectSessionEvents>(session, 'done')
            this.connectionLocker.unlockConnection(peerDescriptor, this.graphId)
            this.sessions.delete(nodeId)
            return true
        } catch (err) {
            logger.warn('Inspect session timed out, removing')
            this.sessions.delete(nodeId)
            this.connectionLocker.unlockConnection(peerDescriptor, this.graphId)
            return session.getInspectedMessageCount() < 1
        }
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
