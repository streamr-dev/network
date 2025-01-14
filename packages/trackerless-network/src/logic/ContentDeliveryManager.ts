import {
    ConnectionLocker,
    DhtAddress,
    DhtNode,
    EXISTING_CONNECTION_TIMEOUT,
    ITransport,
    PeerDescriptor,
    toDhtAddress,
    toNodeId
} from '@streamr/dht'
import {
    Logger,
    Metric,
    MetricsContext,
    MetricsDefinition,
    RateMetric,
    StreamID,
    StreamPartID,
    StreamPartIDUtils,
    UserID,
    toStreamPartID
} from '@streamr/utils'
import { createHash } from 'crypto'
import { EventEmitter } from 'eventemitter3'
import { sampleSize } from 'lodash'
import { ProxyDirection, StreamMessage } from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import { ContentDeliveryLayerNode } from './ContentDeliveryLayerNode'
import { ControlLayerNode } from './ControlLayerNode'
import { DiscoveryLayerNode } from './DiscoveryLayerNode'
import { MAX_NODE_COUNT, PeerDescriptorStoreManager } from './PeerDescriptorStoreManager'
import {
    MIN_NEIGHBOR_COUNT as NETWORK_SPLIT_AVOIDANCE_MIN_NEIGHBOR_COUNT,
    StreamPartNetworkSplitAvoidance
} from './StreamPartNetworkSplitAvoidance'
import { StreamPartReconnect } from './StreamPartReconnect'
import { createContentDeliveryLayerNode } from './createContentDeliveryLayerNode'
import { ProxyClient } from './proxy/ProxyClient'
import { ConnectionManager } from '@streamr/dht/src/exports'
import { StreamPartitionInfo } from '../types'

export type StreamPartDelivery = {
    broadcast: (msg: StreamMessage) => void
    stop: () => Promise<void>
} & (
    | {
          proxied: false
          discoveryLayerNode: DiscoveryLayerNode
          node: ContentDeliveryLayerNode
          networkSplitAvoidance: StreamPartNetworkSplitAvoidance
          getDiagnosticInfo: () => Record<string, unknown>
      }
    | {
          proxied: true
          client: ProxyClient
          getDiagnosticInfo: () => Record<string, unknown>
      }
)

export interface Events {
    newMessage: (msg: StreamMessage) => void
}

const logger = new Logger(module)

interface Metrics extends MetricsDefinition {
    broadcastMessagesPerSecond: Metric
    broadcastBytesPerSecond: Metric
}

export interface ContentDeliveryManagerOptions {
    metricsContext?: MetricsContext
    streamPartitionNeighborTargetCount?: number
    streamPartitionMinPropagationTargets?: number
    acceptProxyConnections?: boolean
    rpcRequestTimeout?: number
    neighborUpdateInterval?: number
}

export const streamPartIdToDataKey = (streamPartId: StreamPartID): DhtAddress => {
    return toDhtAddress(new Uint8Array(createHash('sha1').update(streamPartId).digest()))
}

export class ContentDeliveryManager extends EventEmitter<Events> {
    private transport?: ITransport
    private connectionLocker?: ConnectionLocker
    private controlLayerNode?: ControlLayerNode
    private readonly metricsContext: MetricsContext
    private readonly metrics: Metrics
    private readonly options: ContentDeliveryManagerOptions
    private readonly streamParts: Map<StreamPartID, StreamPartDelivery>
    private readonly knownStreamPartEntryPoints: Map<StreamPartID, PeerDescriptor[]> = new Map()
    private started = false
    private destroyed = false

    constructor(options: ContentDeliveryManagerOptions) {
        super()
        this.options = options
        this.streamParts = new Map()
        this.metricsContext = options.metricsContext ?? new MetricsContext()
        this.metrics = {
            broadcastMessagesPerSecond: new RateMetric(),
            broadcastBytesPerSecond: new RateMetric()
        }
        this.metricsContext.addMetrics('node', this.metrics)
    }

    async start(
        startedAndJoinedControlLayerNode: ControlLayerNode,
        transport: ITransport,
        connectionLocker: ConnectionLocker
    ): Promise<void> {
        if (this.started || this.destroyed) {
            return
        }
        this.started = true
        this.controlLayerNode = startedAndJoinedControlLayerNode
        this.transport = transport
        this.connectionLocker = connectionLocker
    }

    async destroy(): Promise<void> {
        if (!this.started || this.destroyed) {
            return
        }
        logger.trace('Destroying ContentDeliveryManager')
        this.destroyed = true
        await Promise.all(Array.from(this.streamParts.values()).map((streamPart) => streamPart.stop()))
        this.streamParts.clear()
        this.removeAllListeners()
        this.controlLayerNode = undefined
        this.transport = undefined
        this.connectionLocker = undefined
    }

    broadcast(msg: StreamMessage): void {
        const streamPartId = toStreamPartID(msg.messageId!.streamId as StreamID, msg.messageId!.streamPartition)
        logger.debug(`Broadcasting to stream part ${streamPartId}`)
        this.joinStreamPart(streamPartId)
        this.streamParts.get(streamPartId)!.broadcast(msg)
        if (msg.body.oneofKind === 'contentMessage') {
            this.metrics.broadcastMessagesPerSecond.record(1)
            this.metrics.broadcastBytesPerSecond.record(msg.body.contentMessage.content.length)
        }
    }

    async leaveStreamPart(streamPartId: StreamPartID): Promise<void> {
        const streamPart = this.streamParts.get(streamPartId)
        if (streamPart) {
            await streamPart.stop()
            this.streamParts.delete(streamPartId)
        }
    }

    joinStreamPart(streamPartId: StreamPartID): void {
        let streamPart = this.streamParts.get(streamPartId)
        if (streamPart !== undefined) {
            return
        }
        logger.debug(`Join stream part ${streamPartId}`)
        const discoveryLayerNode = this.createDiscoveryLayerNode(
            streamPartId,
            this.knownStreamPartEntryPoints.get(streamPartId) ?? []
        )
        const peerDescriptorStoreManager = new PeerDescriptorStoreManager({
            key: streamPartIdToDataKey(streamPartId),
            localPeerDescriptor: this.getPeerDescriptor(),
            fetchDataFromDht: (key) => this.controlLayerNode!.fetchDataFromDht(key),
            storeDataToDht: (key, data) => this.controlLayerNode!.storeDataToDht(key, data),
            deleteDataFromDht: async (key, waitForCompletion) =>
                this.controlLayerNode!.deleteDataFromDht(key, waitForCompletion)
        })
        const networkSplitAvoidance = new StreamPartNetworkSplitAvoidance({
            discoveryLayerNode,
            discoverEntryPoints: async () => peerDescriptorStoreManager.fetchNodes()
        })
        const node = this.createContentDeliveryLayerNode(streamPartId, discoveryLayerNode, () =>
            peerDescriptorStoreManager.isLocalNodeStored()
        )
        const streamPartReconnect = new StreamPartReconnect(discoveryLayerNode, peerDescriptorStoreManager)
        streamPart = {
            proxied: false,
            discoveryLayerNode,
            node,
            networkSplitAvoidance,
            broadcast: (msg: StreamMessage) => node.broadcast(msg),
            stop: async () => {
                streamPartReconnect.destroy()
                networkSplitAvoidance.destroy()
                await peerDescriptorStoreManager.destroy()
                node.stop()
                await discoveryLayerNode.stop()
            },
            getDiagnosticInfo: () => node.getDiagnosticInfo()
        }
        this.streamParts.set(streamPartId, streamPart)
        node.on('message', (message: StreamMessage) => {
            this.emit('newMessage', message)
        })
        const handleEntryPointLeave = async () => {
            if (
                this.destroyed ||
                peerDescriptorStoreManager.isLocalNodeStored() ||
                this.knownStreamPartEntryPoints.has(streamPartId)
            ) {
                return
            }
            const entryPoints = await peerDescriptorStoreManager.fetchNodes()
            if (entryPoints.length < MAX_NODE_COUNT) {
                await peerDescriptorStoreManager.storeAndKeepLocalNode()
            }
        }
        discoveryLayerNode.on('manualRejoinRequired', async () => {
            if (!streamPartReconnect.isRunning() && !networkSplitAvoidance.isRunning()) {
                logger.debug('Manual rejoin required for stream part', { streamPartId })
                await streamPartReconnect.reconnect()
            }
        })
        node.on('entryPointLeaveDetected', () => handleEntryPointLeave())
        setImmediate(async () => {
            try {
                await this.startLayersAndJoinDht(streamPartId, peerDescriptorStoreManager)
            } catch (err) {
                logger.warn(`Failed to join to stream part ${streamPartId}`, { err })
            }
        })
    }

    private async startLayersAndJoinDht(
        streamPartId: StreamPartID,
        peerDescriptorStoreManager: PeerDescriptorStoreManager
    ): Promise<void> {
        logger.debug(`Start layers and join DHT for stream part ${streamPartId}`)
        const streamPart = this.streamParts.get(streamPartId)
        if (streamPart === undefined || streamPart.proxied) {
            // leaveStreamPart has been called (or leaveStreamPart called, and then setProxies called)
            return
        }
        if ((this.transport! as ConnectionManager).isPrivateClientMode()) {
            await (this.transport! as ConnectionManager).disablePrivateClientMode()
        }
        await streamPart.discoveryLayerNode.start()
        await streamPart.node.start()
        const knownEntryPoints = this.knownStreamPartEntryPoints.get(streamPartId)
        if (knownEntryPoints !== undefined) {
            await Promise.all([
                streamPart.discoveryLayerNode.joinDht(knownEntryPoints),
                streamPart.discoveryLayerNode.joinRing()
            ])
        } else {
            const entryPoints = await peerDescriptorStoreManager.fetchNodes()
            await Promise.all([
                streamPart.discoveryLayerNode.joinDht(
                    sampleSize(entryPoints, NETWORK_SPLIT_AVOIDANCE_MIN_NEIGHBOR_COUNT)
                ),
                streamPart.discoveryLayerNode.joinRing()
            ])
            if (entryPoints.length < MAX_NODE_COUNT) {
                await peerDescriptorStoreManager.storeAndKeepLocalNode()
                if (streamPart.discoveryLayerNode.getNeighborCount() < NETWORK_SPLIT_AVOIDANCE_MIN_NEIGHBOR_COUNT) {
                    setImmediate(() => streamPart.networkSplitAvoidance.avoidNetworkSplit())
                }
            }
        }
    }

    private createDiscoveryLayerNode(streamPartId: StreamPartID, entryPoints: PeerDescriptor[]): DiscoveryLayerNode {
        return new DhtNode({
            transport: this.controlLayerNode!,
            connectionsView: this.controlLayerNode!.getConnectionsView(),
            serviceId: 'layer1::' + streamPartId,
            peerDescriptor: this.controlLayerNode!.getLocalPeerDescriptor(),
            entryPoints,
            numberOfNodesPerKBucket: 4, // TODO use options option or named constant?
            rpcRequestTimeout: EXISTING_CONNECTION_TIMEOUT,
            dhtJoinTimeout: 20000, // TODO use options option or named constant?
            periodicallyPingNeighbors: true,
            periodicallyPingRingContacts: true
        })
    }

    private createContentDeliveryLayerNode(
        streamPartId: StreamPartID,
        discoveryLayerNode: DiscoveryLayerNode,
        isLocalNodeEntryPoint: () => boolean
    ) {
        return createContentDeliveryLayerNode({
            streamPartId,
            transport: this.transport!,
            discoveryLayerNode,
            connectionLocker: this.connectionLocker!,
            localPeerDescriptor: this.controlLayerNode!.getLocalPeerDescriptor(),
            minPropagationTargets: this.options.streamPartitionMinPropagationTargets,
            neighborTargetCount: this.options.streamPartitionNeighborTargetCount,
            acceptProxyConnections: this.options.acceptProxyConnections,
            rpcRequestTimeout: this.options.rpcRequestTimeout,
            neighborUpdateInterval: this.options.neighborUpdateInterval,
            isLocalNodeEntryPoint
        })
    }

    async setProxies(
        streamPartId: StreamPartID,
        nodes: PeerDescriptor[],
        direction: ProxyDirection,
        userId: UserID,
        connectionCount?: number
    ): Promise<void> {
        // TODO explicit default value for "acceptProxyConnections" or make it required
        if (this.options.acceptProxyConnections) {
            throw new Error('cannot set proxies when acceptProxyConnections=true')
        }
        const enable = nodes.length > 0 && (connectionCount === undefined || connectionCount > 0)
        if (enable) {
            let client: ProxyClient
            const alreadyProxied = this.isProxiedStreamPart(streamPartId)
            if (alreadyProxied) {
                client = (this.streamParts.get(streamPartId)! as { client: ProxyClient }).client
            } else {
                client = this.createProxyClient(streamPartId)
                this.streamParts.set(streamPartId, {
                    proxied: true,
                    client,
                    broadcast: (msg: StreamMessage) => client.broadcast(msg),
                    stop: async () => client.stop(),
                    getDiagnosticInfo: () => client.getDiagnosticInfo()
                })
                client.on('message', (message: StreamMessage) => {
                    this.emit('newMessage', message)
                })
                if (Array.from(this.streamParts.values()).every((streamPart) => streamPart.proxied)) {
                    await (this.transport! as ConnectionManager).enablePrivateClientMode()
                }
                await client.start()
            }
            await client.setProxies(nodes, direction, userId, connectionCount)
        } else {
            await this.streamParts.get(streamPartId)?.stop()
            this.streamParts.delete(streamPartId)
        }
    }

    private createProxyClient(streamPartId: StreamPartID): ProxyClient {
        return new ProxyClient({
            transport: this.transport!,
            localPeerDescriptor: this.controlLayerNode!.getLocalPeerDescriptor(),
            streamPartId,
            connectionLocker: this.connectionLocker!,
            minPropagationTargets: this.options.streamPartitionMinPropagationTargets
        })
    }

    async inspect(peerDescriptor: PeerDescriptor, streamPartId: StreamPartID): Promise<boolean> {
        const streamPart = this.streamParts.get(streamPartId)
        if (streamPart !== undefined && !streamPart.proxied) {
            return streamPart.node.inspect(peerDescriptor)
        }
        return false
    }

    // TODO inline this method?
    getNodeInfo(): StreamPartitionInfo[] {
        const streamParts = Array.from(this.streamParts.entries()).filter(([_, node]) => node.proxied === false)
        return streamParts.map(([streamPartId]) => {
            const stream = this.streamParts.get(streamPartId)! as {
                node: ContentDeliveryLayerNode
                discoveryLayerNode: DiscoveryLayerNode
            }
            return {
                id: streamPartId,
                controlLayerNeighbors: stream.discoveryLayerNode.getNeighbors(),
                deprecatedContentDeliveryLayerNeighbors: [],
                contentDeliveryLayerNeighbors: stream.node.getInfos()
            }
        })
    }

    setStreamPartEntryPoints(streamPartId: StreamPartID, entryPoints: PeerDescriptor[]): void {
        this.knownStreamPartEntryPoints.set(streamPartId, entryPoints)
    }

    isProxiedStreamPart(streamPartId: StreamPartID, direction?: ProxyDirection): boolean {
        const streamPart = this.streamParts.get(streamPartId)
        return (
            streamPart !== undefined &&
            streamPart.proxied &&
            (direction === undefined || streamPart.client.getDirection() === direction)
        )
    }

    getStreamPartDelivery(streamPartId: StreamPartID): StreamPartDelivery | undefined {
        return this.streamParts.get(streamPartId)
    }

    hasStreamPart(streamPartId: StreamPartID): boolean {
        return this.streamParts.has(streamPartId)
    }

    getPeerDescriptor(): PeerDescriptor {
        return this.controlLayerNode!.getLocalPeerDescriptor()
    }

    getNodeId(): DhtAddress {
        return toNodeId(this.controlLayerNode!.getLocalPeerDescriptor())
    }

    getNeighbors(streamPartId: StreamPartID): DhtAddress[] {
        const streamPart = this.streamParts.get(streamPartId)
        return streamPart !== undefined && streamPart.proxied === false
            ? streamPart.node.getNeighbors().map((n) => toNodeId(n))
            : []
    }

    getStreamParts(): StreamPartID[] {
        return Array.from(this.streamParts.keys()).map((id) => StreamPartIDUtils.parse(id))
    }

    getDiagnosticInfo(): Record<string, unknown> {
        return {
            streamParts: this.getStreamParts().map((id) => {
                return {
                    id,
                    info: this.getStreamPartDelivery(id)!.getDiagnosticInfo()
                }
            })
        }
    }
}
