import {
    ConnectionLocker,
    DhtNode,
    ITransport,
    PeerDescriptor,
    EXISTING_CONNECTION_TIMEOUT
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
import { Layer0Node } from './Layer0Node'
import { Layer1Node } from './Layer1Node'
import { RandomGraphNode } from './RandomGraphNode'
import { NETWORK_SPLIT_AVOIDANCE_LIMIT, EntryPointDiscovery } from './EntryPointDiscovery'
import { createRandomGraphNode } from './createRandomGraphNode'
import { ProxyClient } from './proxy/ProxyClient'

export type StreamPartDelivery = {
    broadcast: (msg: StreamMessage) => void
    stop: () => void
} & ({ 
    proxied: false
    layer1Node: Layer1Node
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
    rpcRequestTimeout?: number
}

// TODO rename class?
export class StreamrNode extends EventEmitter<Events> {
    private transport?: ITransport
    private connectionLocker?: ConnectionLocker
    private layer0Node?: Layer0Node
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

    async start(startedAndJoinedLayer0Node: Layer0Node, transport: ITransport, connectionLocker: ConnectionLocker): Promise<void> {
        if (this.started || this.destroyed) {
            return
        }
        logger.info(`Starting new StreamrNode with id ${getNodeIdFromPeerDescriptor(startedAndJoinedLayer0Node.getLocalPeerDescriptor())}`)
        this.started = true
        this.layer0Node = startedAndJoinedLayer0Node
        this.transport = transport
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
        this.layer0Node = undefined
        this.transport = undefined
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
        const layer1Node = this.createLayer1Node(streamPartId, this.knownStreamPartEntryPoints.get(streamPartId) ?? [])
        const node = this.createRandomGraphNode(streamPartId, layer1Node)
        const entryPointDiscovery = new EntryPointDiscovery({
            streamPartId,
            localPeerDescriptor: this.getPeerDescriptor(),
            layer1Node,
            getEntryPointData: (key) => this.layer0Node!.getDataFromDht(key),
            storeEntryPointData: (key, data) => this.layer0Node!.storeDataToDht(key, data),
            deleteEntryPointData: async (key) => {
                if (this.destroyed) {
                    return 
                }
                return this.layer0Node!.deleteDataFromDht(key)
            }
        })
        streamPart = {
            proxied: false,
            layer1Node,
            node,
            entryPointDiscovery,
            broadcast: (msg: StreamMessage) => node.broadcast(msg),
            stop: () => {
                entryPointDiscovery.destroy()
                node.stop()
                layer1Node.stop()
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
        await streamPart.layer1Node.start()
        await streamPart.node.start()
        let entryPoints = this.knownStreamPartEntryPoints.get(streamPartId) ?? []
        const discoveryResult = await entryPointDiscovery.discoverEntryPointsFromDht(
            entryPoints.length
        )
        entryPoints = entryPoints.concat(discoveryResult.discoveredEntryPoints)
        await streamPart.layer1Node.joinDht(sampleSize(entryPoints, NETWORK_SPLIT_AVOIDANCE_LIMIT))
        if (discoveryResult.entryPointsFromDht) {
            await entryPointDiscovery.storeSelfAsEntryPointIfNecessary(entryPoints.length)
        }
    }

    private createLayer1Node(streamPartId: StreamPartID, entryPoints: PeerDescriptor[]): Layer1Node {
        return new DhtNode({
            transport: this.layer0Node!,
            serviceId: 'layer1::' + streamPartId,
            peerDescriptor: this.layer0Node!.getLocalPeerDescriptor(),
            entryPoints,
            numberOfNodesPerKBucket: 4,
            rpcRequestTimeout: EXISTING_CONNECTION_TIMEOUT,
            dhtJoinTimeout: 20000
        })
    }

    private createRandomGraphNode(streamPartId: StreamPartID, layer1Node: Layer1Node) {
        return createRandomGraphNode({
            streamPartId,
            transport: this.transport!,
            layer1Node,
            connectionLocker: this.connectionLocker!,
            localPeerDescriptor: this.layer0Node!.getLocalPeerDescriptor(),
            minPropagationTargets: this.config.streamPartitionMinPropagationTargets,
            numOfTargetNeighbors: this.config.streamPartitionNumOfNeighbors,
            acceptProxyConnections: this.config.acceptProxyConnections,
            rpcRequestTimeout: this.config.rpcRequestTimeout
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

    getNodeId(): NodeID {
        return getNodeIdFromPeerDescriptor(this.layer0Node!.getLocalPeerDescriptor())
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
    process.on(term, async () => {
        await cleanUp()
        process.exit()
    })
})

declare let window: any
if (typeof window === 'object') {
    window.addEventListener('unload', async () => {
        await cleanUp()
    })
}
