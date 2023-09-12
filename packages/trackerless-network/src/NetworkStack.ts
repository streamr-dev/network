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
        this.networkStack.on('stopped', this.onStopped)
        this.dhtNode.on('connected', this.onConnected)
    }

    private onConnected = () => {
        this.networkStack.off('stopped', this.onStopped)
        this.dhtNode.off('connected', this.onConnected)
        this.emitter.emit('done')
    }

    private onStopped = () => {
        this.networkStack.off('stopped', this.onStopped)
        this.dhtNode.off('connected', this.onConnected)
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

export class NetworkStack extends EventEmitter<NetworkStackEvents> {

    private connectionManager?: ConnectionManager
    private layer0DhtNode?: DhtNode
    private streamrNode?: StreamrNode
    private readonly metricsContext: MetricsContext
    private readonly options: NetworkOptions
    private readonly firstConnectionTimeout: number
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
        this.firstConnectionTimeout = options.networkNode?.firstConnectionTimeout ?? 5000
    }

    async start(doJoin = true): Promise<void> {
        await this.layer0DhtNode!.start()
        this.connectionManager = this.layer0DhtNode!.getTransport() as ConnectionManager
        if ((this.options.layer0?.entryPoints !== undefined) && (this.options.layer0!.entryPoints!.some((entryPoint) => 
            isSamePeerDescriptor(entryPoint, this.layer0DhtNode!.getPeerDescriptor())
        ))) {
            this.dhtJoinRequired = false
            await this.layer0DhtNode?.joinDht(this.options.layer0.entryPoints)
            await this.streamrNode?.start(this.layer0DhtNode!, this.connectionManager, this.connectionManager)
        } else {
            if (doJoin) {
                this.dhtJoinRequired = false
                await this.joinDht()
            }
            await this.streamrNode?.start(this.layer0DhtNode!, this.connectionManager, this.connectionManager)
        }
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
        await readynessListener.waitUntilReady(this.firstConnectionTimeout)
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
        this.connectionManager = undefined
        this.emit('stopped')
    }

}
