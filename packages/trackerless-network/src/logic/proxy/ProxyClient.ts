import {
    ConnectionLocker,
    DhtAddress,
    ITransport,
    ListeningRpcCommunicator,
    PeerDescriptor,
    toNodeId
} from '@streamr/dht'
import { Logger, StreamPartID, UserID, addManagedEventListener, wait } from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'
import { sampleSize } from 'lodash'
import {
    LeaveStreamPartNotice,
    MessageID,
    MessageRef,
    ProxyDirection,
    StreamMessage
} from '../../../generated/packages/trackerless-network/protos/NetworkRpc'
import {
    ContentDeliveryRpcClient,
    ProxyConnectionRpcClient
} from '../../../generated/packages/trackerless-network/protos/NetworkRpc.client'
import { ContentDeliveryRpcLocal } from '../ContentDeliveryRpcLocal'
import { ContentDeliveryRpcRemote } from '../ContentDeliveryRpcRemote'
import { DuplicateMessageDetector } from '../DuplicateMessageDetector'
import { NodeList } from '../NodeList'
import { formStreamPartContentDeliveryServiceId } from '../formStreamPartDeliveryServiceId'
import { Propagation } from '../propagation/Propagation'
import { markAndCheckDuplicate } from '../utils'
import { ProxyConnectionRpcRemote } from './ProxyConnectionRpcRemote'

// TODO use options option or named constant?
export const retry = async <T>(
    task: () => Promise<T>,
    description: string,
    abortSignal: AbortSignal,
    delay = 10000
): Promise<T> => {
    while (true) {
        try {
            const result = await task()
            return result
        } catch {
            logger.warn(`Failed ${description} (retrying after delay)`, {
                delayInMs: delay
            })
        }
        await wait(delay, abortSignal)
    }
}

interface ProxyClientOptions {
    transport: ITransport
    localPeerDescriptor: PeerDescriptor
    streamPartId: StreamPartID
    connectionLocker: ConnectionLocker
    minPropagationTargets?: number // TODO could be required option if we apply all defaults somewhere at higher level
}

interface ProxyDefinition {
    nodes: Map<DhtAddress, PeerDescriptor>
    connectionCount: number
    direction: ProxyDirection
    userId: UserID
}

interface ProxyConnection {
    peerDescriptor: PeerDescriptor
    direction: ProxyDirection
}

interface Events {
    message: (message: StreamMessage) => void
}

const logger = new Logger(module)

const SERVICE_ID = 'system/proxy-client'

export class ProxyClient extends EventEmitter<Events> {
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly contentDeliveryRpcLocal: ContentDeliveryRpcLocal
    private readonly options: ProxyClientOptions
    private readonly duplicateDetectors: Map<string, DuplicateMessageDetector> = new Map()
    private definition?: ProxyDefinition
    private readonly connections: Map<DhtAddress, ProxyConnection> = new Map()
    private readonly propagation: Propagation
    private readonly neighbors: NodeList
    private readonly abortController: AbortController

    constructor(options: ProxyClientOptions) {
        super()
        this.options = options
        this.rpcCommunicator = new ListeningRpcCommunicator(
            formStreamPartContentDeliveryServiceId(options.streamPartId),
            options.transport
        )
        // TODO use options option or named constant?
        this.neighbors = new NodeList(toNodeId(this.options.localPeerDescriptor), 1000)
        this.contentDeliveryRpcLocal = new ContentDeliveryRpcLocal({
            localPeerDescriptor: this.options.localPeerDescriptor,
            streamPartId: this.options.streamPartId,
            markAndCheckDuplicate: (msg: MessageID, prev?: MessageRef) =>
                markAndCheckDuplicate(this.duplicateDetectors, msg, prev),
            broadcast: (message: StreamMessage, previousNode?: DhtAddress) => this.broadcast(message, previousNode),
            onLeaveNotice: (remoteNodeId: DhtAddress) => {
                const contact = this.neighbors.get(remoteNodeId)
                if (contact) {
                    // TODO should we catch possible promise rejection?
                    setImmediate(() => this.onNodeDisconnected(contact.getPeerDescriptor()))
                }
            },
            rpcCommunicator: this.rpcCommunicator,
            markForInspection: () => {}
        })
        this.propagation = new Propagation({
            // TODO use options option or named constant?
            minPropagationTargets: options.minPropagationTargets ?? 2,
            sendToNeighbor: async (neighborId: DhtAddress, msg: StreamMessage): Promise<void> => {
                const remote = this.neighbors.get(neighborId)
                if (remote) {
                    await remote.sendStreamMessage(msg)
                } else {
                    throw new Error('Propagation target not found')
                }
            }
        })
        this.abortController = new AbortController()
    }

    private registerDefaultServerMethods(): void {
        this.rpcCommunicator.registerRpcNotification(
            StreamMessage,
            'sendStreamMessage',
            (msg: StreamMessage, context) => this.contentDeliveryRpcLocal.sendStreamMessage(msg, context)
        )
        this.rpcCommunicator.registerRpcNotification(
            LeaveStreamPartNotice,
            'leaveStreamPartNotice',
            (req: LeaveStreamPartNotice, context) => this.contentDeliveryRpcLocal.leaveStreamPartNotice(req, context)
        )
    }

    async setProxies(
        nodes: PeerDescriptor[],
        direction: ProxyDirection,
        userId: UserID,
        connectionCount?: number
    ): Promise<void> {
        logger.trace('Setting proxies', {
            streamPartId: this.options.streamPartId,
            peerDescriptors: nodes,
            direction,
            userId,
            connectionCount
        })
        if (connectionCount !== undefined && connectionCount > nodes.length) {
            throw new Error('Cannot set connectionCount above the size of the configured array of nodes')
        }
        const nodesIds = new Map<DhtAddress, PeerDescriptor>()
        nodes.forEach((peerDescriptor) => {
            nodesIds.set(toNodeId(peerDescriptor), peerDescriptor)
        })
        this.definition = {
            nodes: nodesIds,
            userId,
            direction,
            connectionCount: connectionCount ?? nodes.length
        }
        await this.updateConnections()
    }

    private async updateConnections(): Promise<void> {
        await Promise.all(
            this.getInvalidConnections().map(async (id) => {
                await this.closeConnection(id)
            })
        )
        const connectionCountDiff = this.definition!.connectionCount - this.connections.size
        if (connectionCountDiff > 0) {
            await this.openRandomConnections(connectionCountDiff)
        } else if (connectionCountDiff < 0) {
            await this.closeRandomConnections(-connectionCountDiff)
        }
    }

    private getInvalidConnections(): DhtAddress[] {
        return Array.from(this.connections.keys()).filter((id) => {
            return !this.definition!.nodes.has(id) || this.definition!.direction !== this.connections.get(id)!.direction
        })
    }

    private async openRandomConnections(connectionCount: number): Promise<void> {
        const proxiesToAttempt = sampleSize(
            Array.from(this.definition!.nodes.keys()).filter((id) => !this.connections.has(id)),
            connectionCount
        )
        await Promise.all(
            proxiesToAttempt.map((id) =>
                this.attemptConnection(id, this.definition!.direction, this.definition!.userId)
            )
        )
    }

    private async attemptConnection(nodeId: DhtAddress, direction: ProxyDirection, userId: UserID): Promise<void> {
        const peerDescriptor = this.definition!.nodes.get(nodeId)!
        const rpcRemote = new ProxyConnectionRpcRemote(
            this.options.localPeerDescriptor,
            peerDescriptor,
            this.rpcCommunicator,
            ProxyConnectionRpcClient
        )
        const accepted = await rpcRemote.requestConnection(direction, userId)
        if (accepted) {
            this.options.connectionLocker.lockConnection(peerDescriptor, SERVICE_ID)
            this.connections.set(nodeId, { peerDescriptor, direction })
            const remote = new ContentDeliveryRpcRemote(
                this.options.localPeerDescriptor,
                peerDescriptor,
                this.rpcCommunicator,
                ContentDeliveryRpcClient
            )
            this.neighbors.add(remote)
            this.propagation.onNeighborJoined(nodeId)
            logger.info('Open proxy connection', {
                nodeId,
                streamPartId: this.options.streamPartId
            })
        } else {
            logger.warn('Unable to open proxy connection', {
                nodeId,
                streamPartId: this.options.streamPartId
            })
        }
    }

    private async closeRandomConnections(connectionCount: number): Promise<void> {
        const proxiesToDisconnect = sampleSize(Array.from(this.connections.keys()), connectionCount)
        await Promise.allSettled(proxiesToDisconnect.map((node) => this.closeConnection(node)))
    }

    private async closeConnection(nodeId: DhtAddress): Promise<void> {
        if (this.connections.has(nodeId)) {
            logger.info('Close proxy connection', {
                nodeId
            })
            const server = this.neighbors.get(nodeId)
            server?.leaveStreamPartNotice(this.options.streamPartId, false)
            this.removeConnection(this.connections.get(nodeId)!.peerDescriptor)
        }
    }

    private removeConnection(peerDescriptor: PeerDescriptor): void {
        const nodeId = toNodeId(peerDescriptor)
        this.connections.delete(nodeId)
        this.neighbors.remove(nodeId)
        this.options.connectionLocker.unlockConnection(peerDescriptor, SERVICE_ID)
    }

    broadcast(msg: StreamMessage, previousNode?: DhtAddress): void {
        if (!previousNode) {
            markAndCheckDuplicate(this.duplicateDetectors, msg.messageId!, msg.previousMessageRef)
        }
        this.emit('message', msg)
        this.propagation.feedUnseenMessage(msg, this.neighbors.getIds(), previousNode ?? null)
    }

    hasConnection(nodeId: DhtAddress, direction: ProxyDirection): boolean {
        return this.connections.has(nodeId) && this.connections.get(nodeId)!.direction === direction
    }

    getDirection(): ProxyDirection {
        return this.definition!.direction
    }

    private async onNodeDisconnected(peerDescriptor: PeerDescriptor): Promise<void> {
        const nodeId = toNodeId(peerDescriptor)
        if (this.connections.has(nodeId)) {
            this.options.connectionLocker.unlockConnection(peerDescriptor, SERVICE_ID)
            this.removeConnection(peerDescriptor)
            await retry(() => this.updateConnections(), 'updating proxy connections', this.abortController.signal)
        }
    }

    async start(): Promise<void> {
        this.registerDefaultServerMethods()
        addManagedEventListener(
            this.options.transport,
            'disconnected',
            // TODO should we catch possible promise rejection?
            (peerDescriptor: PeerDescriptor) => this.onNodeDisconnected(peerDescriptor),
            this.abortController.signal
        )
    }

    public getDiagnosticInfo(): Record<string, unknown> {
        return {
            neighbors: this.neighbors.getAll().map((neighbor) => neighbor.getPeerDescriptor())
        }
    }

    stop(): void {
        this.neighbors.getAll().forEach((remote) => {
            this.options.connectionLocker.unlockConnection(remote.getPeerDescriptor(), SERVICE_ID)
            remote.leaveStreamPartNotice(this.options.streamPartId, false)
        })
        this.neighbors.stop()
        this.rpcCommunicator.destroy()
        this.connections.clear()
        this.abortController.abort()
    }
}
