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
import { NETWORK_SPLIT_AVOIDANCE_LIMIT, EntryPointDiscovery } from './EntryPointDiscovery'
import { createRandomGraphNode } from './createRandomGraphNode'
import { ProxyClient } from './proxy/ProxyClient'

export type StreamPartDelivery = {
    broadcast: (msg: StreamMessage) => void
    stop: () => void
} & ({ 
    proxied: false
    layer1: ILayer1
    node: RandomGraphNode
    entryPointDiscovery: EntryPointDiscovery
} | {
    proxied: true
    client: ProxyClient
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
    acceptProxyConnections?: boolean
}

// TODO rename class?
export class StreamrNode extends EventEmitter<Events> {
    private P2PTransport?: ITransport
    private connectionLocker?: ConnectionLocker
    private layer0?: ILayer0
    private readonly metricsContext: MetricsContext
    private readonly metrics: Metrics
    private readonly config: StreamrNodeConfig
    private readonly streamParts: Map<StreamPartID, StreamPartDelivery>
    private readonly knownStreamPartEntryPoints: Map<StreamPartID, PeerDescriptor[]> = new Map()
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
        this.streamParts.forEach((streamPart) => streamPart.stop())
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
        const streamPart = this.streamParts.get(streamPartId)
        if (streamPart) {
            streamPart.stop()
            this.streamParts.delete(streamPartId)
        }
    }

    joinStreamPart(streamPartId: StreamPartID): void {
        logger.debug(`Join stream part ${streamPartId}`)
        let streamPart = this.streamParts.get(streamPartId)
        if (streamPart !== undefined) {
            return
        }
        const layer1 = this.createLayer1Node(streamPartId, this.knownStreamPartEntryPoints.get(streamPartId) ?? [])
        const node = this.createRandomGraphNode(streamPartId, layer1)
        const entryPointDiscovery = new EntryPointDiscovery({
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
        streamPart = {
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
        this.streamParts.set(streamPartId, streamPart)
        node.on('message', (message: StreamMessage) => {
            this.emit('newMessage', message)
        })
        setImmediate(async () => {
            try {
                await this.startLayersAndJoinDht(streamPartId, entryPointDiscovery)
            } catch (err) {
                logger.warn(`Failed to join to stream part ${streamPartId} with error: ${err}`)
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
        await streamPart.layer1.start()
        await streamPart.node.start()
        let entryPoints = this.knownStreamPartEntryPoints.get(streamPartId) ?? []
        const discoveryResult = await entryPointDiscovery.discoverEntryPointsFromDht(
            entryPoints.length
        )
        entryPoints = entryPoints.concat(discoveryResult.discoveredEntryPoints)
        await streamPart.layer1.joinDht(sampleSize(entryPoints, NETWORK_SPLIT_AVOIDANCE_LIMIT))
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
            dhtJoinTimeout: 20000
        })
    }

    private createRandomGraphNode = (streamPartId: StreamPartID, layer1: ILayer1) => {
        return createRandomGraphNode({
            streamPartId,
            P2PTransport: this.P2PTransport!,
            layer1,
            connectionLocker: this.connectionLocker!,
            ownPeerDescriptor: this.layer0!.getPeerDescriptor(),
            minPropagationTargets: this.config.streamPartitionMinPropagationTargets,
            numOfTargetNeighbors: this.config.streamPartitionNumOfNeighbors,
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
                    stop: () => client.stop()
                })
                client.on('message', (message: StreamMessage) => {
                    this.emit('newMessage', message)
                })
                await client.start()
            }
            await client.setProxies(nodes, direction, userId, connectionCount)
        } else {
            this.streamParts.get(streamPartId)?.stop()
            this.streamParts.delete(streamPartId)
        }
    }

    private createProxyClient(streamPartId: StreamPartID): ProxyClient {
        return new ProxyClient({
            P2PTransport: this.P2PTransport!,
            ownPeerDescriptor: this.layer0!.getPeerDescriptor(),
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
        return this.layer0!.getPeerDescriptor()
    }

    getNodeId(): NodeID {
        return getNodeIdFromPeerDescriptor(this.layer0!.getPeerDescriptor())
    }

    getNeighbors(streamPartId: StreamPartID): NodeID[] {
        const streamPart = this.streamParts.get(streamPartId)
        return (streamPart !== undefined) && (streamPart.proxied === false)
            ? streamPart.node.getTargetNeighborIds()
            : []
    }

    getStreamParts(): StreamPartID[] {
        return Array.from(this.streamParts.keys()).map((id) => StreamPartIDUtils.parse(id))
    }
}

[`exit`, `SIGINT`, `SIGUSR1`, `SIGUSR2`, `uncaughtException`, `unhandledRejection`, `SIGTERM`].forEach((term) => {
    process.on(term, async (_err) => {
        await cleanUp()
        process.exit()
    })
})
