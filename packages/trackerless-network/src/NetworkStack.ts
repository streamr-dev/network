import { ConnectionManager, DhtNode, DhtNodeOptions, isSamePeerDescriptor } from '@streamr/dht'
import { StreamrNode, StreamrNodeConfig } from './logic/StreamrNode'
import { Logger, MetricsContext, waitForEvent3 } from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'
import { StreamID, StreamPartID, toStreamPartID } from '@streamr/protocol'
import { StreamMessage } from './proto/packages/trackerless-network/protos/NetworkRpc'

interface ReadinessEvents {
    done: () => void
}

class ReadinessListener {

    private readonly emitter = new EventEmitter<ReadinessEvents>()
    private readonly networkStack: NetworkStack
    private readonly dhtNode: DhtNode

    constructor(networkStack: NetworkStack, dhtNode: DhtNode) {
        this.networkStack = networkStack
        this.dhtNode = dhtNode
        this.networkStack.on('stopped', this.onDone)
        this.dhtNode.on('connected', this.onDone)
    }

    private onDone = () => {
        this.networkStack.off('stopped', this.onDone)
        this.dhtNode.off('connected', this.onDone)
        this.emitter.emit('done')
    }

    public async waitUntilReady(timeout: number): Promise<void> {
        if (this.dhtNode.getNumberOfConnections() === 0) {
            await waitForEvent3<ReadinessEvents>(this.emitter, 'done', timeout)
        }
    }
}

export interface NetworkOptions {
    layer0?: DhtNodeOptions
    networkNode?: StreamrNodeConfig
    metricsContext?: MetricsContext
}

export interface NetworkStackEvents {
    stopped: () => void
}

const DEFAULT_FIRST_CONNECTION_TIMEOUT = 5000

const logger = new Logger(module)

export class NetworkStack extends EventEmitter<NetworkStackEvents> {

    private layer0DhtNode?: DhtNode
    private streamrNode?: StreamrNode
    private readonly metricsContext: MetricsContext
    private readonly options: NetworkOptions

    constructor(options: NetworkOptions) {
        super()
        this.options = options
        this.metricsContext = options.metricsContext ?? new MetricsContext()
        this.layer0DhtNode = new DhtNode({
            ...options.layer0,
            metricsContext: this.metricsContext
        })
        this.streamrNode = new StreamrNode({
            ...options.networkNode,
            nodeName: options.networkNode?.nodeName ?? options.layer0?.nodeName,
            metricsContext: this.metricsContext
        })
    }

    async joinStreamPart(streamPartId: StreamPartID): Promise<void> {
        await this.joinLayer0IfRequired(streamPartId)
        setImmediate(async () => {
            try {
                await this.getStreamrNode().joinStream(streamPartId)
            } catch (err) {
                logger.warn(`Failed to join to stream ${streamPartId} with error: ${err}`)
            }
        })
    }

    async broadcast(msg: StreamMessage): Promise<void> {
        const streamPartId = toStreamPartID(msg.messageId!.streamId as StreamID, msg.messageId!.streamPartition)
        await this.joinLayer0IfRequired(streamPartId)
        this.getStreamrNode().broadcast(msg)
    }

    async start(doJoin = true): Promise<void> {
        await this.layer0DhtNode!.start()
        const connectionManager = this.layer0DhtNode!.getTransport() as ConnectionManager
        if ((this.options.layer0?.entryPoints !== undefined) && (this.options.layer0.entryPoints.some((entryPoint) => 
            isSamePeerDescriptor(entryPoint, this.layer0DhtNode!.getPeerDescriptor())
        ))) {
            await this.layer0DhtNode?.joinDht(this.options.layer0.entryPoints)
        } else {
            if (doJoin) {
                await this.joinDht()
            }
        }
        await this.streamrNode?.start(this.layer0DhtNode!, connectionManager, connectionManager)
    }

    private async joinDht(): Promise<void> {
        setImmediate(async () => {
            if (this.options.layer0?.entryPoints !== undefined) {
                // TODO should catch possible rejection?
                await this.layer0DhtNode?.joinDht(this.options.layer0.entryPoints)
            }
        })
        await this.waitForFirstConnection()
    }

    private async waitForFirstConnection(): Promise<void> {
        const readinessListener = new ReadinessListener(this, this.layer0DhtNode!)
        const timeout = this.options.networkNode?.firstConnectionTimeout ?? DEFAULT_FIRST_CONNECTION_TIMEOUT
        await readinessListener.waitUntilReady(timeout)
    }

    async joinLayer0IfRequired(streamPartId: StreamPartID): Promise<void> {
        if (this.streamrNode!.isProxiedStreamPart(streamPartId)) {
            return
        }
        // TODO we could wrap joinDht with pOnce and call it here (no else-if needed in that case)
        if (!this.layer0DhtNode!.hasJoined()) {
            await this.joinDht()
        } else if (this.layer0DhtNode!.getNumberOfConnections() < 1) {
            await this.waitForFirstConnection()
        }
    }

    getStreamrNode(): StreamrNode {
        return this.streamrNode!
    }

    getLayer0DhtNode(): DhtNode {
        return this.layer0DhtNode!
    }

    getMetricsContext(): MetricsContext {
        return this.metricsContext
    }

    async stop(): Promise<void> {
        await this.streamrNode!.destroy()
        this.streamrNode = undefined
        this.layer0DhtNode = undefined
        this.emit('stopped')
    }

}
