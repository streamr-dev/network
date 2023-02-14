import { RandomGraphNode } from './RandomGraphNode'
import { PeerDescriptor, ConnectionLocker, DhtNode, ITransport, keyFromPeerDescriptor } from '@streamr/dht'
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
import { sample } from 'lodash'
import { streamPartIdToDataKey } from './StreamEntryPointDiscovery'
import { Any } from '@streamr/dht/dist/src/proto/google/protobuf/any'

interface StreamObject {
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

interface StreamrNodeOpts {
    metricsContext?: MetricsContext
    nodeName?: string
}

const getLargestPeerDescriptor = (peerDescriptors: PeerDescriptor[]): PeerDescriptor => {
    const sortedArray = peerDescriptors.sort((a, b) => {
        const aValue = parseInt(Buffer.from(a.kademliaId).toString('hex'), 16)
        const bValue = parseInt(Buffer.from(b.kademliaId).toString('hex'), 16)
        return bValue - aValue
    })
    return sortedArray[0]
}

export class StreamrNode extends EventEmitter<Events> {
    private readonly streams: Map<string, StreamObject>
    private layer0: DhtNode | null = null
    private started = false
    private destroyed = false
    private P2PTransport: ITransport | null = null
    private connectionLocker: ConnectionLocker | null = null
    protected extraMetadata: Record<string, unknown> = {}
    private readonly metricsContext: MetricsContext
    private readonly metrics: Metrics
    public config: StreamrNodeOpts

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

    async start(startedAndJoinedLayer0: DhtNode, transport: ITransport, connectionLocker: ConnectionLocker): Promise<void> {
        if (this.started || this.destroyed) {
            return
        }
        logger.info(`Starting new StreamrNode with id ${keyFromPeerDescriptor(startedAndJoinedLayer0.getPeerDescriptor())}`)
        this.started = true
        this.layer0 = startedAndJoinedLayer0
        this.P2PTransport = transport
        this.connectionLocker = connectionLocker
        cleanUp = this.destroy.bind(this)
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
    }

    subscribeToStream(streamPartID: string, knownEntryPointDescriptors: PeerDescriptor[]): void {
        if (!this.streams.has(streamPartID)) {
            this.joinStream(streamPartID, knownEntryPointDescriptors)
                .catch((err) => {
                    logger.warn(`Failed to subscribe to stream ${streamPartID} with error: ${err}`)
                    this.subscribeToStream(streamPartID, knownEntryPointDescriptors)
                })
        }
    }

    publishToStream(streamPartID: string, knownEntryPointDescriptors: PeerDescriptor[], msg: StreamMessage): void {
        if (this.streams.has(streamPartID)) {
            this.streams.get(streamPartID)!.layer2.broadcast(msg)
        } else {
            this.joinStream(streamPartID, knownEntryPointDescriptors)
                .then(() => this.streams.get(streamPartID)?.layer2.broadcast(msg))
                .catch((err) => {
                    logger.warn(`Failed to publish to stream ${streamPartID} with error: ${err}`)
                })
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
        }
    }

    async joinStream(streamPartID: string, knownEntryPointDescriptors: PeerDescriptor[]): Promise<void> {
        if (this.streams.has(streamPartID)) {
            return
        }
        logger.info(`Joining stream ${streamPartID}`)
        if (knownEntryPointDescriptors.length === 0) {
            const discoveredEntrypoints = await this.discoverEntrypoints(streamPartID)
            discoveredEntrypoints.map((entrypoint) => {
                knownEntryPointDescriptors.push(entrypoint)
            })
        }
        const layer1 = new DhtNode({
            transportLayer: this.layer0!,
            serviceId: 'layer1::' + streamPartID,
            peerDescriptor: this.layer0!.getPeerDescriptor(),
            routeMessageTimeout: 5000,
            entryPoints: knownEntryPointDescriptors,
            numberOfNodesPerKBucket: 4,
            rpcRequestTimeout: 15000,
            dhtJoinTimeout: 90000,
            nodeName: this.config.nodeName
        })
        const layer2 = new RandomGraphNode({
            randomGraphId: streamPartID,
            P2PTransport: this.P2PTransport!,
            layer1: layer1,
            connectionLocker: this.connectionLocker!,
            ownPeerDescriptor: this.layer0!.getPeerDescriptor(),
            nodeName: this.config.nodeName
        })
        this.streams.set(streamPartID, {
            layer1,
            layer2
        })
        await layer1.start()
        layer2.start()
        layer2.on('message', (message: StreamMessage) => {
            this.emit('newMessage', message)
        })
        await layer1.joinDht(sample(knownEntryPointDescriptors)!)
    }

    private async discoverEntrypoints(streamPartId: string): Promise<PeerDescriptor[]> {
        const dataKey = streamPartIdToDataKey(streamPartId)
        const results = await this.layer0!.getDataFromDht(dataKey)
        const ownPeerDescriptor = this.getPeerDescriptor()
        const dataToStore = Any.pack(ownPeerDescriptor, PeerDescriptor)
        if (!results.dataEntries) {
            await this.layer0!.storeDataToDht(dataKey, dataToStore)
            const reattempt = await this.layer0!.getDataFromDht(dataKey)
            if (reattempt.dataEntries) {
                const largest = getLargestPeerDescriptor(reattempt.dataEntries.map((entry) => entry.storer!))
                return [largest]
            } else {
                return [ownPeerDescriptor]
            }
            // Keep x nodes as entrypoints in stream, only WS server peers here?
        } else if (results.dataEntries.length < 10) {
            setImmediate(() => this.layer0!.storeDataToDht(dataKey, dataToStore))
        }
        return results.dataEntries!.map((entry) => entry.storer!)
    }

    async waitForJoinAndPublish(streamPartId: string, knownEntryPointDescriptors: PeerDescriptor[], msg: StreamMessage): Promise<number> {
        await this.joinStream(streamPartId, knownEntryPointDescriptors)
        if (this.getStream(streamPartId)!.layer1.getBucketSize() > 0) {
            await waitForCondition(() => this.getStream(streamPartId)!.layer2.getTargetNeighborStringIds().length > 0)
        }
        this.publishToStream(streamPartId, knownEntryPointDescriptors, msg)
        return this.getStream(streamPartId)?.layer2.getTargetNeighborStringIds().length || 0
    }

    async subscribeAndWaitForJoin(streamPartId: string, knownEntryPointDescriptors: PeerDescriptor[]): Promise<number> {
        await this.joinStream(streamPartId, knownEntryPointDescriptors)
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

    getConnectionCount(): number {
        return this.layer0!.getNumberOfConnections()
    }

    getLayer0BucketSize(): number {
        return this.layer0!.getBucketSize()
    }
}

[`exit`, `SIGINT`, `SIGUSR1`, `SIGUSR2`, `uncaughtException`, `SIGTERM`].forEach((term) => {
    process.on(term, async () => {
        await cleanUp()
        process.exit()
    })
})
