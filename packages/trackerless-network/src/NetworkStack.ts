import { ConnectionManager, DhtNode, DhtNodeOptions, isSamePeerDescriptor } from '@streamr/dht'
import { StreamrNode, StreamrNodeConfig } from './logic/StreamrNode'
import { MetricsContext, waitForEvent3 } from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'
import { StreamPartID } from '@streamr/protocol'

interface ReadynessEvents {
    done: () => void
}

class ReadynessListener {

    private readonly emitter = new EventEmitter<ReadynessEvents>()
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
        if (this.dhtNode.getNumberOfConnections() > 0) {
            return
        } else {
            await waitForEvent3<ReadynessEvents>(this.emitter, 'done', timeout)
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

export class NetworkStack extends EventEmitter<NetworkStackEvents> {

    private layer0DhtNode?: DhtNode
    private streamrNode?: StreamrNode
    private readonly metricsContext: MetricsContext
    private readonly options: NetworkOptions
    private dhtJoinRequired = true

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

    async start(doJoin = true): Promise<void> {
        await this.layer0DhtNode!.start()
        const connectionManager = this.layer0DhtNode!.getTransport() as ConnectionManager
        if ((this.options.layer0?.entryPoints !== undefined) && (this.options.layer0.entryPoints.some((entryPoint) => 
            isSamePeerDescriptor(entryPoint, this.layer0DhtNode!.getPeerDescriptor())
        ))) {
            this.dhtJoinRequired = false
            // TODO would it make sense to call this.joinDht here?
            await this.layer0DhtNode?.joinDht(this.options.layer0.entryPoints)
        } else {
            if (doJoin) {
                this.dhtJoinRequired = false
                await this.joinDht()
            }
        }
        await this.streamrNode?.start(this.layer0DhtNode!, connectionManager, connectionManager)
    }

    private async joinDht(): Promise<void> {
        setImmediate(() => {
            if (this.options.layer0?.entryPoints !== undefined) {
                this.layer0DhtNode?.joinDht(this.options.layer0.entryPoints)
            }
        })
        await this.waitForFirstConnection()
    }

    private async waitForFirstConnection(): Promise<void> {
        const readynessListener = new ReadynessListener(this, this.layer0DhtNode!)
        const timeout = this.options.networkNode?.firstConnectionTimeout ?? DEFAULT_FIRST_CONNECTION_TIMEOUT
        await readynessListener.waitUntilReady(timeout)
    }

    async joinLayer0IfRequired(streamPartId: StreamPartID): Promise<void> {
        if (this.isJoinRequired(streamPartId)) {
            this.dhtJoinRequired = false
            await this.joinDht()
        } else if (this.layer0DhtNode!.getNumberOfConnections() < 1) {
            await this.waitForFirstConnection()
        }
    }

    private isJoinRequired(streamPartId: StreamPartID): boolean {
        return this.dhtJoinRequired && !this.layer0DhtNode!.hasJoined() && this.streamrNode!.isJoinRequired(streamPartId)
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
