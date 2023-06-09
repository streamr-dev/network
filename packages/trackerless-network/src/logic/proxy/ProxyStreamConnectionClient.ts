import { 
    ITransport,
    ListeningRpcCommunicator,
    PeerDescriptor,
    PeerIDKey,
    keyFromPeerDescriptor,
    peerIdFromPeerDescriptor
} from "@streamr/dht"
import { LeaveStreamNotice, MessageRef, ProxyDirection, StreamMessage } from "../../proto/packages/trackerless-network/protos/NetworkRpc"
import { IStreamNode } from "../IStreamNode"
import { EventEmitter } from 'eventemitter3'
import { ConnectionLocker } from "@streamr/dht/src/exports"
import { StreamNodeServer } from "../StreamNodeServer"
import { DuplicateMessageDetector, Logger, NumberPair, wait } from "@streamr/utils"
import { PeerList } from "../PeerList"
import { Propagation } from "../propagation/Propagation"
import { sampleSize } from 'lodash'
import { RemoteProxyServer } from "./RemoteProxyServer"
import { NetworkRpcClient, ProxyConnectionRpcClient } from "../../proto/packages/trackerless-network/protos/NetworkRpc.client"
import { toProtoRpcClient } from "@streamr/proto-rpc"
import { RemoteRandomGraphNode } from "../RemoteRandomGraphNode"

export const retry = async <T>(task: () => Promise<T>, description: string, abortSignal: AbortSignal, delay = 10000): Promise<T> => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            const result = await task()
            return result
        } catch (e: any) {
            logger.warn(`Failed ${description} (retrying after delay)`, {
                delayInMs: delay
            })
        }
        await wait(delay, abortSignal)
    }
}

interface ProxyStreamConnectionClientConfig {
    P2PTransport: ITransport
    ownPeerDescriptor: PeerDescriptor
    streamPartId: string
    connectionLocker: ConnectionLocker
    userId: string
    nodeName?: string
}

interface ProxyDefinition {
    peers: Map<PeerIDKey, PeerDescriptor>
    connectionCount: number
    direction: ProxyDirection
    userId: string
}

const logger = new Logger(module)

export class ProxyStreamConnectionClient extends EventEmitter implements IStreamNode {

    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly server: StreamNodeServer
    private readonly config: ProxyStreamConnectionClientConfig
    private readonly duplicateDetectors: Map<string, DuplicateMessageDetector> = new Map()
    private definition?: ProxyDefinition
    private readonly connections: Map<PeerIDKey, ProxyDirection> = new Map()
    private readonly propagation: Propagation
    private readonly targetNeighbors: PeerList
    private readonly abortController: AbortController

    constructor(config: ProxyStreamConnectionClientConfig) {
        super()
        this.config = config
        this.rpcCommunicator = new ListeningRpcCommunicator(`layer2-${config.streamPartId}`, config.P2PTransport)
        this.targetNeighbors = new PeerList(peerIdFromPeerDescriptor(this.config.ownPeerDescriptor), 1000)
        this.server = new StreamNodeServer({
            ownPeerDescriptor: this.config.ownPeerDescriptor,
            randomGraphId: this.config.streamPartId,
            markAndCheckDuplicate: (msg: MessageRef, prev?: MessageRef) => this.markAndCheckDuplicate(msg, prev),
            broadcast: (message: StreamMessage, previousPeer?: string) => this.broadcast(message, previousPeer),
            onLeaveNotice: (notice: LeaveStreamNotice) => {
                const senderId = notice.senderId
                const contact = this.targetNeighbors.getNeighborWithId(senderId)
                if (contact) {
                    setImmediate(() => this.onPeerDisconnected(contact.getPeerDescriptor()))
                }
            },
            rpcCommunicator: this.rpcCommunicator
        })
        this.propagation = new Propagation({
            minPropagationTargets: 2,
            randomGraphId: config.streamPartId,
            sendToNeighbor: async (neighborId: string, msg: StreamMessage): Promise<void> => {
                const remote = this.targetNeighbors.getNeighborWithId(neighborId)
                if (remote) {
                    await remote.sendData(config.ownPeerDescriptor, msg)
                } else {
                    throw new Error('Propagation target not found')
                }
            }
        })
        this.abortController = new AbortController()
    }

    private registerDefaultServerMethods(): void {
        this.rpcCommunicator.registerRpcNotification(StreamMessage, 'sendData',
            (msg: StreamMessage, context) => this.server.sendData(msg, context))
        this.rpcCommunicator.registerRpcNotification(LeaveStreamNotice, 'leaveStreamNotice',
            (req: LeaveStreamNotice, context) => this.server.leaveStreamNotice(req, context))
    }

    private markAndCheckDuplicate(currentMessageRef: MessageRef, previousMessageRef?: MessageRef): boolean {
        const previousNumberPair = previousMessageRef ?
            new NumberPair(Number(previousMessageRef!.timestamp), previousMessageRef!.sequenceNumber)
            : null
        const currentNumberPair = new NumberPair(Number(currentMessageRef.timestamp), currentMessageRef.sequenceNumber)
        if (!this.duplicateDetectors.has(currentMessageRef.messageChainId)) {
            this.duplicateDetectors.set(currentMessageRef.messageChainId, new DuplicateMessageDetector(10000))
        }
        return this.duplicateDetectors.get(currentMessageRef.messageChainId)!.markAndCheck(previousNumberPair, currentNumberPair)
    }

    async setProxies(
        streamPartId: string,
        peerDescriptors: PeerDescriptor[],
        direction: ProxyDirection,
        userId: string,
        connectionCount?: number
    ): Promise<void> {
        logger.trace('Setting proxies', { streamPartId, peerDescriptors, direction, userId, connectionCount })
        if (connectionCount !== undefined && connectionCount > peerDescriptors.length) {
            throw Error('Cannot set connectionCount above the size of the configured array of nodes')
        }
        const peers = new Map()
        peerDescriptors.forEach((peerDescriptor) => {
            peers.set(keyFromPeerDescriptor(peerDescriptor), peerDescriptor)
        })
        this.definition = {
            peers,
            userId,
            direction,
            connectionCount: connectionCount ?? peerDescriptors.length
        }
        await this.updateConnections()
    }

    private async updateConnections(): Promise<void> {
        await Promise.all(this.getInvalidConnections().map(async (id) => {
            await this.closeConnection(id)
        }))
        const connectionCountDiff = this.definition!.connectionCount - this.connections.size
        if (connectionCountDiff > 0) {
            await this.openRandomConnections(connectionCountDiff)
        } else if (connectionCountDiff < 0) {
            await this.closeRandomConnections(-connectionCountDiff)
        }
    }

    private getInvalidConnections(): PeerIDKey[] {
        return Array.from(this.connections.keys()).filter((id) => {
            return !this.definition!.peers.has(id)
                || this.definition!.direction !== this.connections.get(id)
        })
    }

    private async openRandomConnections(connectionCount: number): Promise<void> {
        const proxiesToAttempt = sampleSize(Array.from(this.definition!.peers.keys()).filter((id) =>
            !this.connections.has(id)
        ), connectionCount)
        await Promise.all(proxiesToAttempt.map((id) =>
            this.attemptConnection(id, this.definition!.direction, this.definition!.userId)
        ))
    }

    private async attemptConnection(peer: PeerIDKey, direction: ProxyDirection, userId: string): Promise<void> {
        const peerDescriptor = this.definition!.peers.get(peer)!
        const client = toProtoRpcClient(new ProxyConnectionRpcClient(this.rpcCommunicator.getRpcClientTransport()))
        const proxyPeer = new RemoteProxyServer(peerDescriptor, this.config.streamPartId, client)
        const accepted = await proxyPeer.requestConnection(this.config.ownPeerDescriptor, direction, userId)
        if (accepted) {
            this.config.connectionLocker.lockConnection(peerDescriptor, 'proxy-stream-connection-client')
            this.connections.set(peer, direction)
            const remote = new RemoteRandomGraphNode(
                peerDescriptor,
                this.config.streamPartId,
                toProtoRpcClient(new NetworkRpcClient(this.rpcCommunicator.getRpcClientTransport()))   
            )
            this.targetNeighbors.add(remote)
            this.propagation.onNeighborJoined(peer)
            logger.info('Open proxy connection', {
                peer
            })
        }
    }

    private async closeRandomConnections(connectionCount: number): Promise<void> {
        const proxiesToDisconnect = sampleSize(Array.from(this.connections.keys()), connectionCount)
        await Promise.allSettled(proxiesToDisconnect.map((node) => this.closeConnection(node)))
    }

    private async closeConnection(peerKey: PeerIDKey): Promise<void> {
        if (this.connections.has(peerKey)) {
            logger.info('Close proxy connection', {
                peerKey
            })
            const server = this.targetNeighbors.getNeighborWithId(peerKey)
            server?.leaveStreamNotice(this.config.ownPeerDescriptor)
            this.removeConnection(peerKey)
        }
    }

    private removeConnection(peerKey: PeerIDKey): void {
        this.connections.delete(peerKey)
        this.targetNeighbors.removeById(peerKey)
    }

    broadcast(msg: StreamMessage, previousPeer?: string): void {
        if (!previousPeer) {
            this.markAndCheckDuplicate(msg.messageRef!, msg.previousMessageRef)
        }
        this.emit('message', msg)
        this.propagation.feedUnseenMessage(msg, this.targetNeighbors.getStringIds(), previousPeer || null)
    }

    getTargetNeighborStringIds(): string[] {
        return this.targetNeighbors.getStringIds()
    }

    hasProxyConnection(peerKey: PeerIDKey): boolean {
        return this.connections.has(peerKey)
    }

    async onPeerDisconnected(peerDescriptor: PeerDescriptor): Promise<void> {
        const peerKey = keyFromPeerDescriptor(peerDescriptor)
        if (this.connections.has(peerKey)) {
            this.config.connectionLocker.unlockConnection(peerDescriptor, 'proxy-stream-connection-client')
            this.removeConnection(peerKey)
            await retry(() => this.updateConnections(), 'updating proxy connections', this.abortController.signal)
        }
    }

    async start(): Promise<void> {
        this.registerDefaultServerMethods()
        this.config.P2PTransport.on('disconnected', (peerDescriptor: PeerDescriptor) => 
            this.onPeerDisconnected(peerDescriptor)
        )
    }

    stop(): void {
        this.targetNeighbors.values().map((remote) => {
            this.config.connectionLocker.unlockConnection(remote.getPeerDescriptor(), 'proxy-stream-connection-client')
            remote.leaveStreamNotice(this.config.ownPeerDescriptor)
        })
        this.targetNeighbors.clear()
        this.rpcCommunicator.stop()
        this.connections.clear()
        this.abortController.abort()
        this.config.P2PTransport.off('disconnected', (peerDescriptor: PeerDescriptor) => 
            this.onPeerDisconnected(peerDescriptor)
        )
    }

}
