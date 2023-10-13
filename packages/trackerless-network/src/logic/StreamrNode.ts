import {
    ConnectionLocker,
    DhtNode,
    ITransport,
    PeerDescriptor
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
import { NodeID, getNodeIdFromPeerDescriptor } from '../identifiers'
import { ProxyDirection, StreamMessage } from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { ILayer0 } from './ILayer0'
import { ILayer1 } from './ILayer1'
import { RandomGraphNode } from './RandomGraphNode'
import { NETWORK_SPLIT_AVOIDANCE_LIMIT, StreamPartEntryPointDiscovery } from './StreamPartEntryPointDiscovery'
import { createRandomGraphNode } from './createRandomGraphNode'
import { ProxyStreamConnectionClient } from './proxy/ProxyStreamConnectionClient'

export type StreamPartDelivery = {
    broadcast: (msg: StreamMessage) => void
    stop: () => void
} & ({ 
    proxied: false
    layer1: ILayer1
    node: RandomGraphNode
    entryPointDiscovery: StreamPartEntryPointDiscovery
} | {
    proxied: true
    client: ProxyStreamConnectionClient
})

export interface Events {
    newMessage: (msg: StreamMessage) => void
}

const logger = new Logger(module)

let cleanUp: () => Promise<void> = async () => { }

interface Metrics extends MetricsDefinition {
    broadcastMessagesPerSecond: Metric
    broadcastBytesPerSecond: Metric
}

export interface StreamrNodeConfig {
    metricsContext?: MetricsContext
    streamPartitionNumOfNeighbors?: number
    streamPartitionMinPropagationTargets?: number
    nodeName?: string
    firstConnectionTimeout?: number
    acceptProxyConnections?: boolean
}

// TODO rename class?
export class StreamrNode extends EventEmitter<Events> {
    private P2PTransport?: ITransport
    private connectionLocker?: ConnectionLocker
    private layer0?: ILayer0
    private readonly metricsContext: MetricsContext
    private readonly metrics: Metrics
    public config: StreamrNodeConfig
    private readonly streamParts: Map<string, StreamPartDelivery>
    private readonly knownStreamPartEntryPoints: Map<string, PeerDescriptor[]> = new Map()
    private started = false
    private destroyed = false

    constructor(config: StreamrNodeConfig) {
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

    async start(startedAndJoinedLayer0: ILayer0, transport: ITransport, connectionLocker: ConnectionLocker): Promise<void> {
        if (this.started || this.destroyed) {
            return
        }
        logger.info(`Starting new StreamrNode with id ${getNodeIdFromPeerDescriptor(startedAndJoinedLayer0.getPeerDescriptor())}`)
        this.started = true
        this.layer0 = startedAndJoinedLayer0
        this.P2PTransport = transport
        this.connectionLocker = connectionLocker
        cleanUp = () => this.destroy()
    }

    async destroy(): Promise<void> {
        if (!this.started || this.destroyed) {
            return
        }
        logger.trace('Destroying StreamrNode...')
        this.destroyed = true
        this.streamParts.forEach((stream) => stream.stop())
        this.streamParts.clear()
        this.removeAllListeners()
        await this.layer0!.stop()
        await this.P2PTransport!.stop()
        this.layer0 = undefined
        this.P2PTransport = undefined
        this.connectionLocker = undefined
    }

    broadcast(msg: StreamMessage): void {
        const streamPartId = toStreamPartID(msg.messageId!.streamId as StreamID, msg.messageId!.streamPartition)
        this.joinStreamPart(streamPartId)
        this.streamParts.get(streamPartId)!.broadcast(msg)
        this.metrics.broadcastMessagesPerSecond.record(1)
        this.metrics.broadcastBytesPerSecond.record(msg.content.length)
    }

    leaveStreamPart(streamPartId: StreamPartID): void {
        const stream = this.streamParts.get(streamPartId)
        if (stream) {
            stream.stop()
            this.streamParts.delete(streamPartId)
        }
    }

    joinStreamPart(streamPartId: StreamPartID): void {
        logger.debug(`Join stream part ${streamPartId}`)
        let stream = this.streamParts.get(streamPartId)
        if (stream !== undefined) {
            return
        }
        const layer1 = this.createLayer1Node(streamPartId, this.knownStreamPartEntryPoints.get(streamPartId) ?? [])
        const node = this.createRandomGraphNode(streamPartId, layer1)
        const entryPointDiscovery = new StreamPartEntryPointDiscovery({
            streamPartId,
            ownPeerDescriptor: this.getPeerDescriptor(),
            layer1,
            getEntryPointData: (key) => this.layer0!.getDataFromDht(key),
            storeEntryPointData: (key, data) => this.layer0!.storeDataToDht(key, data),
            deleteEntryPointData: async (key) => {
                if (this.destroyed) {
                    return 
                }
                return this.layer0!.deleteDataFromDht(key)
            }
        })
        stream = {
            proxied: false,
            layer1,
            node,
            entryPointDiscovery,
            broadcast: (msg: StreamMessage) => node.broadcast(msg),
            stop: () => {
                entryPointDiscovery.destroy()
                node.stop()
                layer1.stop()
            }
        }
        this.streamParts.set(streamPartId, stream)
        node.on('message', (message: StreamMessage) => {
            this.emit('newMessage', message)
        })
        setImmediate(async () => {
            try {
                await this.startLayersAndJoinDht(streamPartId, entryPointDiscovery)
            } catch (err) {
                logger.warn(`Failed to join to stream ${streamPartId} with error: ${err}`)
            }
        })
    }

    private async startLayersAndJoinDht(streamPartId: StreamPartID, entryPointDiscovery: StreamPartEntryPointDiscovery): Promise<void> {
        logger.debug(`Start layers and join DHT for stream part ${streamPartId}`)
        const stream = this.streamParts.get(streamPartId)
        if ((stream === undefined) || stream.proxied) {
            // leaveStream has been called (or leaveStream called, and then setProxies called)
            return
        }
        await stream.layer1.start()
        await stream.node.start()
        let entryPoints = this.knownStreamPartEntryPoints.get(streamPartId) ?? []
        const discoveryResult = await entryPointDiscovery.discoverEntryPointsFromDht(
            entryPoints.length
        )
        entryPoints = entryPoints.concat(discoveryResult.discoveredEntryPoints)
        await stream.layer1.joinDht(sampleSize(entryPoints, NETWORK_SPLIT_AVOIDANCE_LIMIT))
        if (discoveryResult.entryPointsFromDht) {
            await entryPointDiscovery.storeSelfAsEntryPointIfNecessary(entryPoints.length)
        }
    }

    private createLayer1Node = (streamPartId: StreamPartID, entryPoints: PeerDescriptor[]): ILayer1 => {
        return new DhtNode({
            transportLayer: this.layer0!,
            serviceId: 'layer1::' + streamPartId,
            peerDescriptor: this.layer0!.getPeerDescriptor(),
            entryPoints,
            numberOfNodesPerKBucket: 4,
            rpcRequestTimeout: 5000,
            dhtJoinTimeout: 20000,
            nodeName: this.config.nodeName + ':layer1'
        })
    }

    private createRandomGraphNode = (streamPartId: StreamPartID, layer1: ILayer1) => {
        return createRandomGraphNode({
            randomGraphId: streamPartId,
            P2PTransport: this.P2PTransport!,
            layer1,
            connectionLocker: this.connectionLocker!,
            ownPeerDescriptor: this.layer0!.getPeerDescriptor(),
            minPropagationTargets: this.config.streamPartitionMinPropagationTargets,
            numOfTargetNeighbors: this.config.streamPartitionNumOfNeighbors,
            name: this.config.nodeName,
            acceptProxyConnections: this.config.acceptProxyConnections
        })
    }

    async setProxies(
        streamPartId: StreamPartID,
        nodes: PeerDescriptor[],
        direction: ProxyDirection,
        userId: EthereumAddress,
        connectionCount?: number
    ): Promise<void> {
        if (this.config.acceptProxyConnections) {
            throw new Error('cannot set proxies when acceptProxyConnections=true')
        }
        const enable = (nodes.length > 0) && ((connectionCount === undefined) || (connectionCount > 0))
        if (enable) {
            let proxyClient: ProxyStreamConnectionClient
            const alreadyProxied = this.isProxiedStreamPart(streamPartId)
            if (alreadyProxied) {
                proxyClient = (this.streamParts.get(streamPartId)! as { client: ProxyStreamConnectionClient }).client 
            } else {
                proxyClient = this.createProxyStream(streamPartId, userId)
                await proxyClient.start()
            }
            await proxyClient.setProxies(streamPartId, nodes, direction, userId, connectionCount)
        } else {
            this.streamParts.get(streamPartId)?.stop()
            this.streamParts.delete(streamPartId)
        }
    }

    private createProxyStream(streamPartId: StreamPartID, userId: EthereumAddress): ProxyStreamConnectionClient {
        const client = this.createProxyStreamConnectionClient(streamPartId, userId)
        this.streamParts.set(streamPartId, {
            proxied: true,
            client,
            broadcast: (msg: StreamMessage) => client.broadcast(msg),
            stop: () => client.stop()
        })
        client.on('message', (message: StreamMessage) => {
            this.emit('newMessage', message)
        })
        return client
    }

    private createProxyStreamConnectionClient(streamPartId: StreamPartID, userId: EthereumAddress): ProxyStreamConnectionClient {
        return new ProxyStreamConnectionClient({
            P2PTransport: this.P2PTransport!,
            ownPeerDescriptor: this.layer0!.getPeerDescriptor(),
            streamPartId,
            connectionLocker: this.connectionLocker!,
            minPropagationTargets: this.config.streamPartitionMinPropagationTargets,
            nodeName: this.config.nodeName,
            userId
        })
    }

    async inspect(peerDescriptor: PeerDescriptor, streamPartId: StreamPartID): Promise<boolean> {
        const stream = this.streamParts.get(streamPartId)
        if ((stream !== undefined) && !stream.proxied) {
            return stream.node.inspect(peerDescriptor)
        }
        return false
    }

    setStreamPartEntryPoints(streamPartId: StreamPartID, entryPoints: PeerDescriptor[]): void {
        this.knownStreamPartEntryPoints.set(streamPartId, entryPoints)
    }

    isProxiedStreamPart(streamId: string, direction?: ProxyDirection): boolean {
        const stream = this.streamParts.get(streamId)
        return (stream !== undefined)
            && stream.proxied
            && ((direction === undefined) || (stream.client.getDirection() === direction))
    }

    getStream(streamPartId: StreamPartID): StreamPartDelivery | undefined {
        return this.streamParts.get(streamPartId)
    }

    hasStream(streamPartId: StreamPartID): boolean {
        return this.streamParts.has(streamPartId)
    }

    getPeerDescriptor(): PeerDescriptor {
        return this.layer0!.getPeerDescriptor()
    }

    getNodeId(): NodeID {
        return this.layer0!.getNodeId().toKey() as unknown as NodeID
    }

    getNeighbors(streamPartId: StreamPartID): NodeID[] {
        const stream = this.streamParts.get(streamPartId)
        return (stream !== undefined) && (stream.proxied === false)
            ? stream.node.getTargetNeighborIds()
            : []
    }

    getStreamParts(): StreamPartID[] {
        return Array.from(this.streamParts.keys()).map((id) => StreamPartIDUtils.parse(id))
    }
}

[`exit`, `SIGINT`, `SIGUSR1`, `SIGUSR2`, `uncaughtException`, `unhandledRejection`, `SIGTERM`].forEach((term) => {
    process.on(term, async () => {
        await cleanUp()
        process.exit()
    })
})
