import { RandomGraphNode } from './RandomGraphNode'
import {
    PeerDescriptor,
    ConnectionLocker,
    DhtNode,
    ITransport
} from '@streamr/dht'
import { StreamMessage } from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { EventEmitter } from 'eventemitter3'
import {
    Logger,
    MetricsContext,
    RateMetric,
    Metric,
    MetricsDefinition,
    waitForEvent3
} from '@streamr/utils'
import { uniq } from 'lodash'
import { StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import { sampleSize } from 'lodash'
import { StreamEntryPointDiscovery } from './StreamEntryPointDiscovery'
import { ILayer0 } from './ILayer0'
import { createRandomGraphNode } from './createRandomGraphNode'
import { ProxyDirection } from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { IStreamNode } from './IStreamNode'
import { ProxyStreamConnectionClient } from './proxy/ProxyStreamConnectionClient'
import { NodeID, UserID, getNodeIdFromPeerDescriptor } from '../identifiers'

export enum StreamNodeType {
    RANDOM_GRAPH = 'random-graph',
    PROXY = 'proxy'
}

export interface NeighborCounterEvents {
    targetReached: () => void
}

class NeighborCounter {

    private counter = 0
    private readonly emitter = new EventEmitter<NeighborCounterEvents>()
    private readonly randomGraphNode: RandomGraphNode
    private readonly targetNumberOfNeighbors: number

    constructor(randomGraphNode: RandomGraphNode, targetNumberOfNeighbors: number) {
        this.randomGraphNode = randomGraphNode
        this.targetNumberOfNeighbors = targetNumberOfNeighbors
        this.counter = randomGraphNode.getTargetNeighborIds().length
        this.randomGraphNode.on('targetNeighborConnected', this.onTargetNeighborConnected)
    }

    private onTargetNeighborConnected = () => {
        this.counter++
        if (this.counter == this.targetNumberOfNeighbors) {
            this.randomGraphNode.off('targetNeighborConnected', this.onTargetNeighborConnected)
            this.emitter.emit('targetReached')
        }
    }

    public async waitForTargetReached(timeout = 5000): Promise<void> {
        if (this.counter >= this.targetNumberOfNeighbors) {
            return
        } else {
            await waitForEvent3<NeighborCounterEvents>(this.emitter, 'targetReached', timeout)
        }
    }
}

export interface StreamObject {
    layer1?: DhtNode
    layer2: IStreamNode
    type: StreamNodeType
}

export interface Events {
    newMessage: (msg: StreamMessage) => void
}

const logger = new Logger(module)

let cleanUp: () => Promise<void> = async () => { }

interface Metrics extends MetricsDefinition {
    publishMessagesPerSecond: Metric
    publishBytesPerSecond: Metric
}

export interface StreamrNodeConfig {
    metricsContext?: MetricsContext
    streamPartitionNumOfNeighbors?: number
    streamPartitionMinPropagationTargets?: number
    nodeName?: string
    firstConnectionTimeout?: number
    acceptProxyConnections?: boolean
}

export class StreamrNode extends EventEmitter<Events> {
    private P2PTransport?: ITransport
    private connectionLocker?: ConnectionLocker
    private layer0?: ILayer0
    private streamEntryPointDiscovery?: StreamEntryPointDiscovery
    private readonly metricsContext: MetricsContext
    private readonly metrics: Metrics
    public config: StreamrNodeConfig
    private readonly streams: Map<string, StreamObject>
    private readonly knownStreamEntryPoints: Map<string, PeerDescriptor[]> = new Map()
    protected extraMetadata: Record<string, unknown> = {}
    private started = false
    private destroyed = false

    constructor(config: StreamrNodeConfig) {
        super()
        this.config = config
        this.streams = new Map()
        this.metricsContext = config.metricsContext ?? new MetricsContext()
        this.metrics = {
            publishMessagesPerSecond: new RateMetric(),
            publishBytesPerSecond: new RateMetric()
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
            streams: this.streams,
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
        this.streams.forEach((stream) => {
            stream.layer2.stop()
            stream.layer1?.stop()
        })
        await this.streamEntryPointDiscovery!.destroy()
        this.streams.clear()
        this.removeAllListeners()
        await this.layer0!.stop()
        await this.P2PTransport!.stop()
        this.layer0 = undefined
        this.P2PTransport = undefined
        this.streamEntryPointDiscovery = undefined
        this.connectionLocker = undefined
    }

    subscribeToStream(streamPartId: StreamPartID): void {
        if (!this.streams.has(streamPartId)) {
            this.joinStream(streamPartId)
                .catch((err) => {
                    logger.warn(`Failed to subscribe to stream ${streamPartId} with error: ${err}`)
                })
        }
    }

    publishToStream(streamPartId: StreamPartID, msg: StreamMessage): void {
        if (this.streams.has(streamPartId)) {
            this.streams.get(streamPartId)!.layer2.broadcast(msg)
        } else {
            this.joinStream(streamPartId)
                .catch((err) => {
                    logger.warn(`Failed to publish to stream ${streamPartId} with error: ${err}`)
                })
            this.streams.get(streamPartId)!.layer2.broadcast(msg)
        }
        this.metrics.publishMessagesPerSecond.record(1)
        this.metrics.publishBytesPerSecond.record(msg.content.length)
    }

    unsubscribeFromStream(streamPartId: StreamPartID): void {
        this.leaveStream(streamPartId)
    }

    leaveStream(streamPartId: StreamPartID): void {
        const stream = this.streams.get(streamPartId)
        if (stream) {
            stream.layer2.stop()
            stream.layer1?.stop()
            this.streams.delete(streamPartId)
        }
        this.streamEntryPointDiscovery!.removeSelfAsEntryPoint(streamPartId)
    }

    async joinStream(streamPartId: StreamPartID): Promise<void> {
        if (this.streams.has(streamPartId)) {
            return
        }
        logger.debug(`Joining stream ${streamPartId}`)
        const knownEntryPoints = this.knownStreamEntryPoints.get(streamPartId) ?? []
        let entryPoints = knownEntryPoints.concat(knownEntryPoints)
        const [layer1, layer2] = this.createStream(streamPartId, knownEntryPoints)
        await layer1.start()
        await layer2.start()
        const forwardingPeer = this.layer0!.isJoinOngoing() ? this.layer0!.getKnownEntryPoints()[0] : undefined
        const discoveryResult = await this.streamEntryPointDiscovery!.discoverEntryPointsFromDht(
            streamPartId,
            knownEntryPoints.length,
            forwardingPeer
        )
        entryPoints = knownEntryPoints.concat(discoveryResult.discoveredEntryPoints)
        await layer1.joinDht(sampleSize(entryPoints, 4))
        await this.streamEntryPointDiscovery!.storeSelfAsEntryPointIfNecessary(
            streamPartId,
            discoveryResult.joiningEmptyStream,
            discoveryResult.entryPointsFromDht,
            entryPoints.length
        )
    }

    private createStream(streamPartId: StreamPartID, entryPoints: PeerDescriptor[]): [DhtNode, RandomGraphNode] {
        const layer1 = this.createLayer1Node(streamPartId, entryPoints)
        const layer2 = this.createRandomGraphNode(streamPartId, layer1)
        this.streams.set(streamPartId, {
            type: StreamNodeType.RANDOM_GRAPH,
            layer1,
            layer2
        })
        layer2.on('message', (message: StreamMessage) => {
            this.emit('newMessage', message)
        })
        return [layer1, layer2]
    }

    private createLayer1Node = (streamPartId: StreamPartID, entryPoints: PeerDescriptor[]) => {
        return new DhtNode({
            transportLayer: this.layer0!,
            serviceId: 'layer1::' + streamPartId,
            peerDescriptor: this.layer0!.getPeerDescriptor(),
            entryPoints,
            numberOfNodesPerKBucket: 4,
            rpcRequestTimeout: 15000,
            dhtJoinTimeout: 60000,
            nodeName: this.config.nodeName + ':layer1'
        })
    }

    private createRandomGraphNode = (streamPartId: StreamPartID, layer1: DhtNode) => {
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

    async waitForJoinAndPublish(
        streamPartId: StreamPartID,
        msg: StreamMessage,
        timeout?: number
    ): Promise<number> {
        if (this.getStream(streamPartId)?.type === StreamNodeType.PROXY) {
            return 0
        }
        await this.joinStream(streamPartId)
        if (this.getStream(streamPartId)!.layer1!.getBucketSize() > 0) {
            const neighborCounter = new NeighborCounter(this.getStream(streamPartId)!.layer2 as RandomGraphNode, 1)
            await neighborCounter.waitForTargetReached(timeout)
        }
        this.publishToStream(streamPartId, msg)
        return this.getStream(streamPartId)?.layer2.getTargetNeighborIds().length ?? 0
    }

    async waitForJoinAndSubscribe(
        streamPartId: StreamPartID,
        timeout?: number,
        expectedNeighbors = 1
    ): Promise<number> {
        if (this.getStream(streamPartId)?.type === StreamNodeType.PROXY) {
            return 0
        }
        await this.joinStream(streamPartId)
        if (this.getStream(streamPartId)!.layer1!.getBucketSize() > 0) {
            const neighborCounter = new NeighborCounter(this.getStream(streamPartId)!.layer2 as RandomGraphNode, expectedNeighbors)
            await neighborCounter.waitForTargetReached(timeout)
        }
        this.subscribeToStream(streamPartId)
        return this.getStream(streamPartId)?.layer2.getTargetNeighborIds().length ?? 0
    }

    async setProxies(
        streamPartId: StreamPartID,
        contactPeerDescriptors: PeerDescriptor[],
        direction: ProxyDirection,
        userId: UserID,
        connectionCount?: number
    ): Promise<void> {
        if (this.streams.get(streamPartId)?.type === StreamNodeType.PROXY && contactPeerDescriptors.length > 0) {
            const proxyClient = this.streams.get(streamPartId)!.layer2 as ProxyStreamConnectionClient
            await proxyClient.setProxies(streamPartId, contactPeerDescriptors, direction, userId, connectionCount)
        } else if (this.streams.get(streamPartId)?.type === StreamNodeType.PROXY && contactPeerDescriptors.length === 0) {
            this.streams.get(streamPartId)!.layer2.stop()
            this.streams.delete(streamPartId)
        } else {
            const proxyClient = this.createProxyStream(streamPartId, userId)
            await proxyClient.start()
            await proxyClient.setProxies(streamPartId, contactPeerDescriptors, direction, userId, connectionCount)
        }
    }

    private createProxyStream(streamPartId: StreamPartID, userId: UserID): ProxyStreamConnectionClient {
        const layer2 = this.createProxyStreamConnectionClient(streamPartId, userId)
        this.streams.set(streamPartId, {
            type: StreamNodeType.PROXY,
            layer2
        })
        layer2.on('message', (message: StreamMessage) => {
            this.emit('newMessage', message)
        })
        return layer2
    }

    private createProxyStreamConnectionClient(streamPartId: StreamPartID, userId: UserID): ProxyStreamConnectionClient {
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
        if (this.streams.get(streamPartId)?.type === StreamNodeType.RANDOM_GRAPH) {
            const streamNode = this.streams.get(streamPartId)!.layer2 as RandomGraphNode
            return streamNode.inspect(peerDescriptor)
        }
        return false
    }

    setStreamPartEntryPoints(streamPartId: StreamPartID, entryPoints: PeerDescriptor[]): void {
        this.knownStreamEntryPoints.set(streamPartId, entryPoints)
    }

    isProxiedStreamPart(streamId: string, direction: ProxyDirection): boolean {
        return this.streams.get(streamId)?.type === StreamNodeType.PROXY 
            && (this.streams.get(streamId)!.layer2 as ProxyStreamConnectionClient).getDirection() === direction
    }

    hasProxyConnection(streamId: string, nodeId: NodeID, direction: ProxyDirection): boolean {
        return this.streams.has(streamId) && this.streams.get(streamId)!.layer2.hasProxyConnection(nodeId, direction)
    }

    getStream(streamPartId: StreamPartID): StreamObject | undefined {
        return this.streams.get(streamPartId)
    }

    hasStream(streamPartId: StreamPartID): boolean {
        return this.streams.has(streamPartId)
    }

    getPeerDescriptor(): PeerDescriptor {
        return this.layer0!.getPeerDescriptor()
    }

    getNodeId(): NodeID {
        return this.layer0!.getNodeId().toKey() as unknown as NodeID
    }

    getNeighbors(): NodeID[] {
        const neighbors: NodeID[] = []
        this.streams.forEach((stream) =>
            stream.layer2.getTargetNeighborIds().forEach((neighbor) => neighbors.push(neighbor))
        )
        return uniq(neighbors)
    }

    getStreamParts(): StreamPartID[] {
        return Array.from(this.streams.keys()).map((id) => StreamPartIDUtils.parse(id))
    }

    setExtraMetadata(metadata: Record<string, unknown>): void {
        this.extraMetadata = metadata
    }

    isJoinRequired(streamPartId: StreamPartID): boolean {
        return !this.streams.has(streamPartId) && Array.from(this.streams.values()).every((stream) => stream.type === StreamNodeType.PROXY)
    }

}

[`exit`, `SIGINT`, `SIGUSR1`, `SIGUSR2`, `uncaughtException`, `unhandledRejection`, `SIGTERM`].forEach((term) => {
    process.on(term, async () => {
        await cleanUp()
        process.exit()
    })
})
