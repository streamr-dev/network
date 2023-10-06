import {
    ITransport,
    ListeningRpcCommunicator,
    PeerDescriptor
} from '@streamr/dht'
import { ConnectionLocker } from '@streamr/dht/src/exports'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { StreamPartID } from '@streamr/protocol'
import { EthereumAddress, Logger, addManagedEventListener, wait } from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'
import { sampleSize } from 'lodash'
import { NodeID, getNodeIdFromPeerDescriptor } from '../../identifiers'
import { LeaveStreamPartNotice, MessageID, MessageRef, ProxyDirection, StreamMessage } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { NetworkRpcClient, ProxyConnectionRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { DuplicateMessageDetector } from '../DuplicateMessageDetector'
import { IStreamNode } from '../IStreamNode'
import { NodeList } from '../NodeList'
import { RemoteRandomGraphNode } from '../RemoteRandomGraphNode'
import { StreamNodeServer } from '../StreamNodeServer'
import { Propagation } from '../propagation/Propagation'
import { markAndCheckDuplicate } from '../utils'
import { RemoteProxyServer } from './RemoteProxyServer'

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
    streamPartId: StreamPartID
    connectionLocker: ConnectionLocker
    userId: EthereumAddress
    nodeName?: string
}

interface ProxyDefinition {
    nodes: Map<NodeID, PeerDescriptor>
    connectionCount: number
    direction: ProxyDirection
    userId: EthereumAddress
}

const logger = new Logger(module)

export class ProxyStreamConnectionClient extends EventEmitter implements IStreamNode {

    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly server: StreamNodeServer
    private readonly config: ProxyStreamConnectionClientConfig
    private readonly duplicateDetectors: Map<string, DuplicateMessageDetector> = new Map()
    private definition?: ProxyDefinition
    private readonly connections: Map<NodeID, ProxyDirection> = new Map()
    private readonly propagation: Propagation
    private readonly targetNeighbors: NodeList
    private readonly abortController: AbortController

    constructor(config: ProxyStreamConnectionClientConfig) {
        super()
        this.config = config
        this.rpcCommunicator = new ListeningRpcCommunicator(`layer2-${config.streamPartId}`, config.P2PTransport)
        this.targetNeighbors = new NodeList(getNodeIdFromPeerDescriptor(this.config.ownPeerDescriptor), 1000)
        this.server = new StreamNodeServer({
            ownPeerDescriptor: this.config.ownPeerDescriptor,
            randomGraphId: this.config.streamPartId,
            markAndCheckDuplicate: (msg: MessageID, prev?: MessageRef) => markAndCheckDuplicate(this.duplicateDetectors, msg, prev),
            broadcast: (message: StreamMessage, previousNode?: NodeID) => this.broadcast(message, previousNode),
            onLeaveNotice: (senderId: NodeID) => {
                const contact = this.targetNeighbors.getNeighborById(senderId)
                if (contact) {
                    setImmediate(() => this.onNodeDisconnected(contact.getPeerDescriptor()))
                }
            },
            rpcCommunicator: this.rpcCommunicator,
            markForInspection: (_senderId: NodeID, _messageId: MessageID) => {}
        })
        this.propagation = new Propagation({
            minPropagationTargets: 2,
            sendToNeighbor: async (neighborId: NodeID, msg: StreamMessage): Promise<void> => {
                const remote = this.targetNeighbors.getNeighborById(neighborId)
                if (remote) {
                    await remote.sendData(msg)
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
        this.rpcCommunicator.registerRpcNotification(LeaveStreamPartNotice, 'leaveStreamPartNotice',
            (req: LeaveStreamPartNotice, context) => this.server.leaveStreamPartNotice(req, context))
    }

    async setProxies(
        streamPartId: StreamPartID,
        nodes: PeerDescriptor[],
        direction: ProxyDirection,
        userId: EthereumAddress,
        connectionCount?: number
    ): Promise<void> {
        logger.trace('Setting proxies', { streamPartId, peerDescriptors: nodes, direction, userId, connectionCount })
        if (connectionCount !== undefined && connectionCount > nodes.length) {
            throw Error('Cannot set connectionCount above the size of the configured array of nodes')
        }
        const nodesIds = new Map()
        nodes.forEach((peerDescriptor) => {
            nodesIds.set(getNodeIdFromPeerDescriptor(peerDescriptor), peerDescriptor)
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

    private getInvalidConnections(): NodeID[] {
        return Array.from(this.connections.keys()).filter((id) => {
            return !this.definition!.nodes.has(id )
                || this.definition!.direction !== this.connections.get(id)
        })
    }

    private async openRandomConnections(connectionCount: number): Promise<void> {
        const proxiesToAttempt = sampleSize(Array.from(this.definition!.nodes.keys()).filter((id) =>
            !this.connections.has(id as unknown as NodeID)
        ), connectionCount)
        await Promise.all(proxiesToAttempt.map((id) =>
            this.attemptConnection(id as unknown as NodeID, this.definition!.direction, this.definition!.userId)
        ))
    }

    private async attemptConnection(nodeId: NodeID, direction: ProxyDirection, userId: EthereumAddress): Promise<void> {
        const peerDescriptor = this.definition!.nodes.get(nodeId)!
        const client = toProtoRpcClient(new ProxyConnectionRpcClient(this.rpcCommunicator.getRpcClientTransport()))
        const proxyNode = new RemoteProxyServer(this.config.ownPeerDescriptor, peerDescriptor, this.config.streamPartId, client)
        const accepted = await proxyNode.requestConnection(direction, userId)
        if (accepted) {
            this.config.connectionLocker.lockConnection(peerDescriptor, 'proxy-stream-connection-client')
            this.connections.set(nodeId, direction)
            const remote = new RemoteRandomGraphNode(
                this.config.ownPeerDescriptor,
                peerDescriptor,
                this.config.streamPartId,
                toProtoRpcClient(new NetworkRpcClient(this.rpcCommunicator.getRpcClientTransport()))
            )
            this.targetNeighbors.add(remote)
            this.propagation.onNeighborJoined(nodeId)
            logger.info('Open proxy connection', {
                nodeId,
                streamPartId: this.config.streamPartId
            })
        } else {
            logger.warn('Unable to open proxy connection', {
                nodeId,
                streamPartId: this.config.streamPartId
            })
        }
    }

    private async closeRandomConnections(connectionCount: number): Promise<void> {
        const proxiesToDisconnect = sampleSize(Array.from(this.connections.keys()), connectionCount)
        await Promise.allSettled(proxiesToDisconnect.map((node) => this.closeConnection(node)))
    }

    private async closeConnection(nodeId: NodeID): Promise<void> {
        if (this.connections.has(nodeId)) {
            logger.info('Close proxy connection', {
                nodeId
            })
            const server = this.targetNeighbors.getNeighborById(nodeId)
            server?.leaveStreamPartNotice()
            this.removeConnection(nodeId)
        }
    }

    private removeConnection(nodeId: NodeID): void {
        this.connections.delete(nodeId)
        this.targetNeighbors.removeById(nodeId)
    }

    broadcast(msg: StreamMessage, previousNode?: NodeID): void {
        if (!previousNode) {
            markAndCheckDuplicate(this.duplicateDetectors, msg.messageId!, msg.previousMessageRef)
        }
        this.emit('message', msg)
        this.propagation.feedUnseenMessage(msg, this.targetNeighbors.getIds(), previousNode ?? null)
    }

    getTargetNeighborIds(): NodeID[] {
        return this.targetNeighbors.getIds()
    }

    hasProxyConnection(nodeId: NodeID, direction: ProxyDirection): boolean {
        return this.connections.has(nodeId) && this.connections.get(nodeId) === direction
    }

    getDirection(): ProxyDirection {
        return this.definition!.direction
    }

    async onNodeDisconnected(peerDescriptor: PeerDescriptor): Promise<void> {
        const nodeId = getNodeIdFromPeerDescriptor(peerDescriptor)
        if (this.connections.has(nodeId)) {
            this.config.connectionLocker.unlockConnection(peerDescriptor, 'proxy-stream-connection-client')
            this.removeConnection(nodeId)
            await retry(() => this.updateConnections(), 'updating proxy connections', this.abortController.signal)
        }
    }

    async start(): Promise<void> {
        this.registerDefaultServerMethods()
        addManagedEventListener<any, any>(
            this.config.P2PTransport as any,
            'disconnected',
            (peerDescriptor: PeerDescriptor) => this.onNodeDisconnected(peerDescriptor),
            this.abortController.signal
        )
    }

    stop(): void {
        this.targetNeighbors.getNodes().map((remote) => {
            this.config.connectionLocker.unlockConnection(remote.getPeerDescriptor(), 'proxy-stream-connection-client')
            remote.leaveStreamPartNotice()
        })
        this.targetNeighbors.stop()
        this.rpcCommunicator.stop()
        this.connections.clear()
        this.abortController.abort()
    }

}
