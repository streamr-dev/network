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
import { IStreamNode } from './IStreamNode'
import { RandomGraphNode } from './RandomGraphNode'
import { NETWORK_SPLIT_AVOIDANCE_LIMIT, StreamEntryPointDiscovery } from './StreamEntryPointDiscovery'
import { createRandomGraphNode } from './createRandomGraphNode'
import { ProxyStreamConnectionClient } from './proxy/ProxyStreamConnectionClient'

export enum StreamNodeType {
    RANDOM_GRAPH = 'random-graph',
    PROXY = 'proxy'
}

export interface StreamPartDelivery { // TODO rename maybe have "proxied: boolean" instead of StreamNodeType
    layer1?: ILayer1
    layer2: IStreamNode
    type: StreamNodeType
}

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
    private streamEntryPointDiscovery?: StreamEntryPointDiscovery
    private readonly metricsContext: MetricsContext
    private readonly metrics: Metrics
    public config: StreamrNodeConfig
    private readonly streamParts: Map<string, StreamPartDelivery>
    private readonly knownStreamEntryPoints: Map<string, PeerDescriptor[]> = new Map()
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
        this.streamEntryPointDiscovery = new StreamEntryPointDiscovery({
            ownPeerDescriptor: this.getPeerDescriptor(),
            streams: this.streamParts,
            getEntryPointData: (key) => this.layer0!.getDataFromDht(key),
            getEntryPointDataViaNode: (key, node) => this.layer0!.findDataViaPeer(key, node),
            storeEntryPointData: (key, data) => this.layer0!.storeDataToDht(key, data),
            deleteEntryPointData: (key) => this.layer0!.deleteDataFromDht(key)
        })
        cleanUp = () => this.destroy()
    }

    async destroy(): Promise<void> {
        if (!this.started || this.destroyed) {
            return
        }
        logger.trace('Destroying StreamrNode...')
        this.destroyed = true
        this.streamParts.forEach((stream) => {
            stream.layer2.stop()
            stream.layer1?.stop()
        })
        await this.streamEntryPointDiscovery!.destroy()
        this.streamParts.clear()
        this.removeAllListeners()
        await this.layer0!.stop()
        await this.P2PTransport!.stop()
        this.layer0 = undefined
        this.P2PTransport = undefined
        this.streamEntryPointDiscovery = undefined
        this.connectionLocker = undefined
    }

    broadcast(msg: StreamMessage): void {
        const streamPartId = toStreamPartID(msg.messageId!.streamId as StreamID, msg.messageId!.streamPartition)
        this.joinStream(streamPartId)
        this.streamParts.get(streamPartId)!.layer2.broadcast(msg)
        this.metrics.broadcastMessagesPerSecond.record(1)
        this.metrics.broadcastBytesPerSecond.record(msg.content.length)
    }

    leaveStream(streamPartId: StreamPartID): void { // TODO rename to leaveStreamPart
        const stream = this.streamParts.get(streamPartId)
        if (stream) {
            stream.layer2.stop()
            stream.layer1?.stop()
            this.streamParts.delete(streamPartId)
        }
        this.streamEntryPointDiscovery!.removeSelfAsEntryPoint(streamPartId)
    }

    joinStream(streamPartId: StreamPartID): void { // TODO rename to joinStreamPart
        logger.debug(`Join stream part ${streamPartId}`)
        let stream = this.streamParts.get(streamPartId)
        if (stream !== undefined) {
            return
        }
        const layer1 = this.createLayer1Node(streamPartId, this.knownStreamEntryPoints.get(streamPartId) ?? [])
        const layer2 = this.createRandomGraphNode(streamPartId, layer1)
        stream = {
            type: StreamNodeType.RANDOM_GRAPH,
            layer1,
            layer2
        }
        this.streamParts.set(streamPartId, stream)
        layer2.on('message', (message: StreamMessage) => {
            this.emit('newMessage', message)
        })
        setImmediate(async () => {
            try {
                await this.startLayersAndJoinDht(streamPartId)
            } catch (err) {
                logger.warn(`Failed to join to stream ${streamPartId} with error: ${err}`)
            }
        })
    }

    private async startLayersAndJoinDht(streamPartId: StreamPartID): Promise<void> {
        logger.debug(`Start layers and join DHT for stream part ${streamPartId}`)
        const stream = this.streamParts.get(streamPartId)!
        if ((stream === undefined) || (stream.type !== StreamNodeType.RANDOM_GRAPH)) {
            // leaveStream has been called (or leaveStream called, and then setProxied called)
            return
        }
        await stream.layer1!.start()
        await stream.layer2.start()
        let entryPoints = this.knownStreamEntryPoints.get(streamPartId) ?? []
        const forwardingNode = this.layer0!.isJoinOngoing() ? this.layer0!.getKnownEntryPoints()[0] : undefined
        const discoveryResult = await this.streamEntryPointDiscovery!.discoverEntryPointsFromDht(
            streamPartId,
            entryPoints.length,
            forwardingNode
        )
        entryPoints = entryPoints.concat(discoveryResult.discoveredEntryPoints)
        await stream.layer1!.joinDht(sampleSize(entryPoints, NETWORK_SPLIT_AVOIDANCE_LIMIT))
        await this.streamEntryPointDiscovery!.storeSelfAsEntryPointIfNecessary(
            streamPartId,
            discoveryResult.entryPointsFromDht,
            entryPoints.length
        )
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
                proxyClient = this.streamParts.get(streamPartId)!.layer2 as ProxyStreamConnectionClient
            } else {
                proxyClient = this.createProxyStream(streamPartId, userId)
                await proxyClient.start()
            }
            await proxyClient.setProxies(streamPartId, nodes, direction, userId, connectionCount)
        } else {
            this.streamParts.get(streamPartId)?.layer2.stop()
            this.streamParts.delete(streamPartId)
        }
    }

    private createProxyStream(streamPartId: StreamPartID, userId: EthereumAddress): ProxyStreamConnectionClient {
        const layer2 = this.createProxyStreamConnectionClient(streamPartId, userId)
        this.streamParts.set(streamPartId, {
            type: StreamNodeType.PROXY,
            layer2
        })
        layer2.on('message', (message: StreamMessage) => {
            this.emit('newMessage', message)
        })
        return layer2
    }

    private createProxyStreamConnectionClient(streamPartId: StreamPartID, userId: EthereumAddress): ProxyStreamConnectionClient {
        return new ProxyStreamConnectionClient({
            P2PTransport: this.P2PTransport!,
            ownPeerDescriptor: this.layer0!.getPeerDescriptor(),
            streamPartId,
            connectionLocker: this.connectionLocker!,
            nodeName: this.config.nodeName,
            userId
        })
    }

    async inspect(peerDescriptor: PeerDescriptor, streamPartId: StreamPartID): Promise<boolean> {
        if (this.streamParts.get(streamPartId)?.type === StreamNodeType.RANDOM_GRAPH) {
            const streamNode = this.streamParts.get(streamPartId)!.layer2 as RandomGraphNode
            return streamNode.inspect(peerDescriptor)
        }
        return false
    }

    setStreamPartEntryPoints(streamPartId: StreamPartID, entryPoints: PeerDescriptor[]): void {
        this.knownStreamEntryPoints.set(streamPartId, entryPoints)
    }

    isProxiedStreamPart(streamId: string, direction?: ProxyDirection): boolean {
        return this.streamParts.get(streamId)?.type === StreamNodeType.PROXY 
            && ((direction === undefined) || (this.streamParts.get(streamId)!.layer2 as ProxyStreamConnectionClient).getDirection() === direction)
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
        return (stream?.type == StreamNodeType.RANDOM_GRAPH)
            ? stream.layer2.getTargetNeighborIds()
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
