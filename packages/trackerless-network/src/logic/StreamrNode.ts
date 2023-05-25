import { RandomGraphNode } from './RandomGraphNode'
import {
    PeerDescriptor,
    ConnectionLocker,
    DhtNode,
    ITransport,
    keyFromPeerDescriptor
} from '@streamr/dht'
import { StreamMessage } from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { EventEmitter } from 'eventemitter3'
import {
    Logger,
    waitForCondition,
    MetricsContext,
    RateMetric,
    Metric,
    MetricsDefinition
} from '@streamr/utils'
import { uniq } from 'lodash'
import { StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import { sampleSize } from 'lodash'
import { StreamEntryPointDiscovery } from './StreamEntryPointDiscovery'
import { ILayer0 } from './ILayer0'
import { createRandomGraphNode } from './createRandomGraphNode'

export interface StreamObject {
    layer1: DhtNode
    layer2: RandomGraphNode
}

export interface Events {
    newMessage: (msg: StreamMessage) => void
}

const logger = new Logger(module)

let cleanUp: () => Promise<void> = async () => {}

interface Metrics extends MetricsDefinition {
    publishMessagesPerSecond: Metric
    publishBytesPerSecond: Metric
}

export interface StreamrNodeOpts {
    metricsContext?: MetricsContext
    id?: string
    layer2NumOfTargetNeighbors?: number
    layer2MaxNumberOfContact?: number
    layer2MinPropagationTargets?: number
    nodeName?: string
    firstConnectionTimeout?: number
}

export class StreamrNode extends EventEmitter<Events> {
    private P2PTransport?: ITransport
    private connectionLocker?: ConnectionLocker
    private layer0?: ILayer0
    private streamEntryPointDiscovery?: StreamEntryPointDiscovery
    private readonly metricsContext: MetricsContext
    private readonly metrics: Metrics
    public config: StreamrNodeOpts
    private readonly streams: Map<string, StreamObject>
    protected extraMetadata: Record<string, unknown> = {}
    private started = false
    private destroyed = false

    constructor(config: StreamrNodeOpts) {
        super()
        this.config = config
        this.streams = new Map()
        this.metricsContext = config.metricsContext || new MetricsContext()
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
        logger.info(`Starting new StreamrNode with id ${keyFromPeerDescriptor(startedAndJoinedLayer0.getPeerDescriptor())}`)
        this.started = true
        this.layer0 = startedAndJoinedLayer0
        this.P2PTransport = transport
        this.connectionLocker = connectionLocker
        this.streamEntryPointDiscovery = new StreamEntryPointDiscovery({
            ownPeerDescriptor: this.getPeerDescriptor(),
            streams: this.streams,
            getEntryPointData: (key) => this.layer0!.getDataFromDht(key),
            getEntryPointDataViaPeer: (peerDescriptor, key) => this.layer0!.findDataViaPeer(peerDescriptor, key),
            storeEntryPointData: (key, data) => this.layer0!.storeDataToDht(key, data)
        })
        cleanUp = () => this.destroy()
    }

    async destroy(): Promise<void> {
        if (!this.started || this.destroyed) {
            return
        }
        logger.info('Destroying StreamrNode...')
        this.destroyed = true
        this.streams.forEach((stream) => {
            stream.layer2.stop()
            stream.layer1.stop()
        })
        this.streams.clear()
        this.removeAllListeners()
        await this.layer0!.stop()
        await this.P2PTransport!.stop()
        await this.streamEntryPointDiscovery!.destroy()
        this.layer0 = undefined
        this.P2PTransport = undefined
        this.streamEntryPointDiscovery = undefined
        this.connectionLocker = undefined
    }

    subscribeToStream(streamPartID: string, knownEntryPointDescriptors: PeerDescriptor[]): void {
        if (!this.streams.has(streamPartID)) {
            this.joinStream(streamPartID, knownEntryPointDescriptors)
                .catch((err) => {
                    logger.warn(`Failed to subscribe to stream ${streamPartID} with error: ${err}`)
                })
        }
    }

    publishToStream(streamPartID: string, knownEntryPointDescriptors: PeerDescriptor[], msg: StreamMessage): void {
        if (this.streams.has(streamPartID)) {
            this.streams.get(streamPartID)!.layer2.broadcast(msg)
        } else {
            this.joinStream(streamPartID, knownEntryPointDescriptors)
                .catch((err) => {
                    logger.warn(`Failed to publish to stream ${streamPartID} with error: ${err}`)
                })
            this.streams.get(streamPartID)!.layer2.broadcast(msg)
        }
    }

    unsubscribeFromStream(streamPartID: string): void {
        this.leaveStream(streamPartID)
    }

    leaveStream(streamPartID: string): void {
        const stream = this.streams.get(streamPartID)
        if (stream) {
            stream.layer2.stop()
            stream.layer1.stop()
            this.streams.delete(streamPartID)
        }
        this.streamEntryPointDiscovery!.stopRecaching(streamPartID)
    }

    async joinStream(streamPartID: string, knownEntryPointDescriptors: PeerDescriptor[]): Promise<void> {
        if (this.streams.has(streamPartID)) {
            return
        }
        logger.info(`Joining stream ${streamPartID}`)
        const [ layer1, layer2 ] = this.createStream(streamPartID, knownEntryPointDescriptors)
        await layer1.start()
        await layer2.start()
        const forwardingPeer = this.layer0!.isJoinOngoing() ? this.layer0!.getKnownEntryPoints()[0] : undefined
        const discoveryResult = await this.streamEntryPointDiscovery!.discoverEntryPointsFromDht(
            streamPartID,
            knownEntryPointDescriptors.length,
            forwardingPeer
        )
        const entryPoints = knownEntryPointDescriptors.concat(discoveryResult.discoveredEntryPoints)
        await Promise.all(sampleSize(entryPoints, 4).map((entryPoint) => layer1.joinDht(entryPoint)))
        await this.streamEntryPointDiscovery!.storeSelfAsEntryPointIfNecessary(
            streamPartID,
            discoveryResult.joiningEmptyStream,
            discoveryResult.entryPointsFromDht,
            entryPoints.length
        )
    }

    private createStream(streamPartID: string, entryPoints: PeerDescriptor[]): [DhtNode, RandomGraphNode] {
        const layer1 = this.createLayer1Node(streamPartID, entryPoints)
        const layer2 = this.createRandomGraphNode(streamPartID, layer1)
        this.streams.set(streamPartID, {
            layer1,
            layer2
        })
        layer2.on('message', (message: StreamMessage) => {
            this.emit('newMessage', message)
        })
        return [layer1, layer2]
    }

    private createLayer1Node = (streamPartID: string, entryPoints: PeerDescriptor[]) => {
        return new DhtNode({
            transportLayer: this.layer0!,
            serviceId: 'layer1::' + streamPartID,
            peerDescriptor: this.layer0!.getPeerDescriptor(),
            routeMessageTimeout: 5000,
            entryPoints: entryPoints,
            numberOfNodesPerKBucket: 4,
            rpcRequestTimeout: 15000,
            dhtJoinTimeout: 60000,
            nodeName: this.config.nodeName
        })
    }

    private createRandomGraphNode = (streamPartID: string, layer1: DhtNode) => {
        return createRandomGraphNode({
            randomGraphId: streamPartID,
            P2PTransport: this.P2PTransport!,
            layer1: layer1,
            connectionLocker: this.connectionLocker!,
            ownPeerDescriptor: this.layer0!.getPeerDescriptor(),
            minPropagationTargets: this.config.layer2MinPropagationTargets,
            numOfTargetNeighbors: this.config.layer2NumOfTargetNeighbors,
            maxNumberOfContacts: this.config.layer2MaxNumberOfContact,
            nodeName: this.config.nodeName
        })
    }

    async waitForJoinAndPublish(
        streamPartId: string,
        knownEntryPointDescriptors: PeerDescriptor[],
        msg: StreamMessage,
        timeout?: number
    ): Promise<number> {
        await this.joinStream(streamPartId, knownEntryPointDescriptors)
        if (this.getStream(streamPartId)!.layer1.getBucketSize() > 0) {
            await waitForCondition(() => this.getStream(streamPartId)!.layer2.getTargetNeighborStringIds().length > 0, timeout)
        }
        this.publishToStream(streamPartId, knownEntryPointDescriptors, msg)
        return this.getStream(streamPartId)?.layer2.getTargetNeighborStringIds().length || 0
    }

    async waitForJoinAndSubscribe(streamPartId: string, knownEntryPointDescriptors: PeerDescriptor[], timeout?: number): Promise<number> {
        await this.joinStream(streamPartId, knownEntryPointDescriptors)
        if (this.getStream(streamPartId)!.layer1.getBucketSize() > 0) {
            await waitForCondition(() => this.getStream(streamPartId)!.layer2.getTargetNeighborStringIds().length > 0, timeout)
        }
        this.subscribeToStream(streamPartId, knownEntryPointDescriptors)
        return this.getStream(streamPartId)?.layer2.getTargetNeighborStringIds().length || 0
    }

    getStream(streamPartId: string): StreamObject | undefined {
        return this.streams.get(streamPartId)
    }

    hasStream(streamPartId: string): boolean {
        return this.streams.has(streamPartId)
    }

    getPeerDescriptor(): PeerDescriptor {
        return this.layer0!.getPeerDescriptor()
    }

    getNodeId(): string {
        return this.layer0!.getNodeId().toKey()
    }

    getNodeStringId(): string {
        return this.layer0!.getNodeId().toString()
    }

    getNeighbors(): string[] {
        const neighbors: string[] = []
        this.streams.forEach((stream) =>
            stream.layer2.getTargetNeighborStringIds().forEach((neighbor) => neighbors.push(neighbor))
        )
        return uniq(neighbors)
    }

    getStreamParts(): StreamPartID[] {
        return Array.from(this.streams.keys()).map((stringId) => StreamPartIDUtils.parse(stringId))
    }

    setExtraMetadata(metadata: Record<string, unknown>): void {
        this.extraMetadata = metadata
    }

}

[`exit`, `SIGINT`, `SIGUSR1`, `SIGUSR2`, `uncaughtException`, `unhandledRejection`, `SIGTERM`].forEach((term) => {
    process.on(term, async () => {
        await cleanUp()
        process.exit()
    })
})
