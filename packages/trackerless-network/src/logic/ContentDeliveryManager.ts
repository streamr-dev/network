import {
    ConnectionLocker,
    DhtAddress,
    DhtNode,
    EXISTING_CONNECTION_TIMEOUT,
    ITransport,
    PeerDescriptor,
    getNodeIdFromPeerDescriptor
} from '@streamr/dht'
import { StreamID, StreamPartID, StreamPartIDUtils, toStreamPartID } from '@streamr/protocol'
import {
    EthereumAddress,
    Logger,
    Metric,
    MetricsContext,
    MetricsDefinition,
    RateMetric
} from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'
import { sampleSize } from 'lodash'
import { ProxyDirection, StreamMessage, StreamPartitionInfo } from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { EntryPointDiscovery, NETWORK_SPLIT_AVOIDANCE_LIMIT } from './EntryPointDiscovery'
import { Layer0Node } from './Layer0Node'
import { Layer1Node } from './Layer1Node'
import { ContentDeliveryLayerNode } from './ContentDeliveryLayerNode'
import { createContentDeliveryLayerNode } from './createContentDeliveryLayerNode'
import { ProxyClient } from './proxy/ProxyClient'
import { StreamPartReconnect } from './StreamPartReconnect'

export type StreamPartDelivery = {
    broadcast: (msg: StreamMessage) => void
    stop: () => Promise<void>
} & ({ 
    proxied: false
    layer1Node: Layer1Node
    node: ContentDeliveryLayerNode
    entryPointDiscovery: EntryPointDiscovery
} | {
    proxied: true
    client: ProxyClient
})

export interface Events {
    newMessage: (msg: StreamMessage) => void
}

const logger = new Logger(module)

interface Metrics extends MetricsDefinition {
    broadcastMessagesPerSecond: Metric
    broadcastBytesPerSecond: Metric
}

export interface ContentDeliveryManagerConfig {
    metricsContext?: MetricsContext
    streamPartitionNeighborTargetCount?: number
    streamPartitionMinPropagationTargets?: number
    acceptProxyConnections?: boolean
    rpcRequestTimeout?: number
}

export class ContentDeliveryManager extends EventEmitter<Events> {

    private transport?: ITransport
    private connectionLocker?: ConnectionLocker
    private layer0Node?: Layer0Node
    private readonly metricsContext: MetricsContext
    private readonly metrics: Metrics
    private readonly config: ContentDeliveryManagerConfig
    private readonly streamParts: Map<StreamPartID, StreamPartDelivery>
    private readonly knownStreamPartEntryPoints: Map<StreamPartID, PeerDescriptor[]> = new Map()
    private started = false
    private destroyed = false

    constructor(config: ContentDeliveryManagerConfig) {
        super()
        this.config = config
        this.streamParts = new Map()
        this.metricsContext = config.metricsContext ?? new MetricsContext()
        this.metrics = {
            broadcastMessagesPerSecond: new RateMetric(),
            broadcastBytesPerSecond: new RateMetric()
        }
        this.metricsContext.addMetrics('node', this.metrics)
    }

    async start(startedAndJoinedLayer0Node: Layer0Node, transport: ITransport, connectionLocker: ConnectionLocker): Promise<void> {
        if (this.started || this.destroyed) {
            return
        }
        this.started = true
        this.layer0Node = startedAndJoinedLayer0Node
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
        this.layer0Node = undefined
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
        const layer1Node = this.createLayer1Node(streamPartId, this.knownStreamPartEntryPoints.get(streamPartId) ?? [])
        const entryPointDiscovery = new EntryPointDiscovery({
            streamPartId,
            localPeerDescriptor: this.getPeerDescriptor(),
            layer1Node,
            fetchEntryPointData: (key) => this.layer0Node!.fetchDataFromDht(key),
            storeEntryPointData: (key, data) => this.layer0Node!.storeDataToDht(key, data),
            deleteEntryPointData: async (key) => this.layer0Node!.deleteDataFromDht(key, false)
        })
        const node = this.createContentDeliveryLayerNode(
            streamPartId,
            layer1Node, 
            () => entryPointDiscovery.isLocalNodeEntryPoint()
        )
        const streamPartReconnect = new StreamPartReconnect(layer1Node, entryPointDiscovery)
        streamPart = {
            proxied: false,
            layer1Node,
            node,
            entryPointDiscovery,
            broadcast: (msg: StreamMessage) => node.broadcast(msg),
            stop: async () => {
                streamPartReconnect.destroy()
                await entryPointDiscovery.destroy()
                node.stop()
                await layer1Node.stop()
            }
        }
        this.streamParts.set(streamPartId, streamPart)
        node.on('message', (message: StreamMessage) => {
            this.emit('newMessage', message)
        })
        const handleEntryPointLeave = async () => {
            if (this.destroyed || entryPointDiscovery.isLocalNodeEntryPoint() || this.knownStreamPartEntryPoints.has(streamPartId)) {
                return
            }
            const entryPoints = await entryPointDiscovery.discoverEntryPointsFromDht(0)
            await entryPointDiscovery.storeSelfAsEntryPointIfNecessary(entryPoints.discoveredEntryPoints.length)
        }
        layer1Node.on('manualRejoinRequired', async () => {
            if (!streamPartReconnect.isRunning() && !entryPointDiscovery.isNetworkSplitAvoidanceRunning()) {
                logger.debug('Manual rejoin required for stream part', { streamPartId })
                await streamPartReconnect.reconnect()
            }
        })
        node.on('entryPointLeaveDetected', () => handleEntryPointLeave())
        setImmediate(async () => {
            try {
                await this.startLayersAndJoinDht(streamPartId, entryPointDiscovery)
            } catch (err) {
                logger.warn(`Failed to join to stream part ${streamPartId}`, { err })
            }
        })
    }

    private async startLayersAndJoinDht(streamPartId: StreamPartID, entryPointDiscovery: EntryPointDiscovery): Promise<void> {
        logger.debug(`Start layers and join DHT for stream part ${streamPartId}`)
        const streamPart = this.streamParts.get(streamPartId)
        if ((streamPart === undefined) || streamPart.proxied) {
            // leaveStreamPart has been called (or leaveStreamPart called, and then setProxies called)
            return
        }
        await streamPart.layer1Node.start()
        await streamPart.node.start()
        let entryPoints = this.knownStreamPartEntryPoints.get(streamPartId) ?? []
        const discoveryResult = await entryPointDiscovery.discoverEntryPointsFromDht(
            entryPoints.length
        )
        entryPoints = entryPoints.concat(discoveryResult.discoveredEntryPoints)
        await Promise.all([
            streamPart.layer1Node.joinDht(sampleSize(entryPoints, NETWORK_SPLIT_AVOIDANCE_LIMIT)),
            streamPart.layer1Node.joinRing()
        ])
        if (discoveryResult.entryPointsFromDht) {
            await entryPointDiscovery.storeSelfAsEntryPointIfNecessary(entryPoints.length)
        }
    }

    private createLayer1Node(streamPartId: StreamPartID, entryPoints: PeerDescriptor[]): Layer1Node {
        return new DhtNode({
            transport: this.layer0Node!,
            connectionsView: this.layer0Node!.getConnectionsView(),
            serviceId: 'layer1::' + streamPartId,
            peerDescriptor: this.layer0Node!.getLocalPeerDescriptor(),
            entryPoints,
            numberOfNodesPerKBucket: 4,  // TODO use config option or named constant?
            rpcRequestTimeout: EXISTING_CONNECTION_TIMEOUT,
            dhtJoinTimeout: 20000,  // TODO use config option or named constant?
            periodicallyPingNeighbors: true,
            periodicallyPingRingContacts: true
        })
    }

    private createContentDeliveryLayerNode(
        streamPartId: StreamPartID,
        layer1Node: Layer1Node,
        isLocalNodeEntryPoint: () => boolean
    ) {
        return createContentDeliveryLayerNode({
            streamPartId,
            transport: this.transport!,
            layer1Node,
            connectionLocker: this.connectionLocker!,
            localPeerDescriptor: this.layer0Node!.getLocalPeerDescriptor(),
            minPropagationTargets: this.config.streamPartitionMinPropagationTargets,
            neighborTargetCount: this.config.streamPartitionNeighborTargetCount,
            acceptProxyConnections: this.config.acceptProxyConnections,
            rpcRequestTimeout: this.config.rpcRequestTimeout,
            isLocalNodeEntryPoint
        })
    }

    async setProxies(
        streamPartId: StreamPartID,
        nodes: PeerDescriptor[],
        direction: ProxyDirection,
        userId: EthereumAddress,
        connectionCount?: number
    ): Promise<void> {
        // TODO explicit default value for "acceptProxyConnections" or make it required
        if (this.config.acceptProxyConnections) {
            throw new Error('cannot set proxies when acceptProxyConnections=true')
        }
        const enable = (nodes.length > 0) && ((connectionCount === undefined) || (connectionCount > 0))
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
                    stop: async () => client.stop()
                })
                client.on('message', (message: StreamMessage) => {
                    this.emit('newMessage', message)
                })
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
            localPeerDescriptor: this.layer0Node!.getLocalPeerDescriptor(),
            streamPartId,
            connectionLocker: this.connectionLocker!,
            minPropagationTargets: this.config.streamPartitionMinPropagationTargets
        })
    }

    async inspect(peerDescriptor: PeerDescriptor, streamPartId: StreamPartID): Promise<boolean> {
        const streamPart = this.streamParts.get(streamPartId)
        if ((streamPart !== undefined) && !streamPart.proxied) {
            return streamPart.node.inspect(peerDescriptor)
        }
        return false
    }

    // TODO inline this method?
    getNodeInfo(): StreamPartitionInfo[] {
        const streamParts = Array.from(this.streamParts.entries()).filter(([_, node]) => node.proxied === false)
        return streamParts.map(([streamPartId]) => {
            const stream = this.streamParts.get(streamPartId)! as { node: ContentDeliveryLayerNode, layer1Node: Layer1Node }
            return {
                id: streamPartId,
                controlLayerNeighbors: stream.layer1Node.getNeighbors(),
                contentDeliveryLayerNeighbors: stream.node.getNeighbors()
            }
        })

    }

    setStreamPartEntryPoints(streamPartId: StreamPartID, entryPoints: PeerDescriptor[]): void {
        this.knownStreamPartEntryPoints.set(streamPartId, entryPoints)
    }

    isProxiedStreamPart(streamPartId: StreamPartID, direction?: ProxyDirection): boolean {
        const streamPart = this.streamParts.get(streamPartId)
        return (streamPart !== undefined)
            && streamPart.proxied
            && ((direction === undefined) || (streamPart.client.getDirection() === direction))
    }

    getStreamPartDelivery(streamPartId: StreamPartID): StreamPartDelivery | undefined {
        return this.streamParts.get(streamPartId)
    }

    hasStreamPart(streamPartId: StreamPartID): boolean {
        return this.streamParts.has(streamPartId)
    }

    getPeerDescriptor(): PeerDescriptor {
        return this.layer0Node!.getLocalPeerDescriptor()
    }

    getNodeId(): DhtAddress {
        return getNodeIdFromPeerDescriptor(this.layer0Node!.getLocalPeerDescriptor())
    }

    getNeighbors(streamPartId: StreamPartID): DhtAddress[] {
        const streamPart = this.streamParts.get(streamPartId)
        return (streamPart !== undefined) && (streamPart.proxied === false)
            ? streamPart.node.getNeighbors().map((n) => getNodeIdFromPeerDescriptor(n))
            : []
    }

    getStreamParts(): StreamPartID[] {
        return Array.from(this.streamParts.keys()).map((id) => StreamPartIDUtils.parse(id))
    }
}
