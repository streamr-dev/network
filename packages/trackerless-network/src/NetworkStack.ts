import { ConnectionManager, DhtNode, DhtNodeOptions, isSamePeerDescriptor } from '@streamr/dht'
import { StreamrNode, StreamrNodeOpts } from './logic/StreamrNode'
import { MetricsContext, waitForCondition } from '@streamr/utils'

export interface NetworkOptions {
    layer0: DhtNodeOptions
    networkNode: StreamrNodeOpts
    metricsContext?: MetricsContext
}

export class NetworkStack {

    private connectionManager?: ConnectionManager
    private layer0DhtNode?: DhtNode
    private streamrNode?: StreamrNode
    private readonly metricsContext: MetricsContext
    private readonly options: NetworkOptions
    private stopped = false

    constructor(options: NetworkOptions) {
        this.options = options
        this.metricsContext = options.metricsContext || new MetricsContext()
        this.layer0DhtNode = new DhtNode({
            ...options.layer0,
            metricsContext: this.metricsContext
        })
        this.streamrNode = new StreamrNode({
            ...options.networkNode,
            metricsContext: this.metricsContext
        })
    }

    async start(): Promise<void> {
        await this.layer0DhtNode!.start()
        this.connectionManager = this.layer0DhtNode!.getTransport() as ConnectionManager
        const entryPoint = this.options.layer0.entryPoints![0]
        if (isSamePeerDescriptor(entryPoint, this.layer0DhtNode!.getPeerDescriptor())) {
            await this.layer0DhtNode?.joinDht(entryPoint)
            await this.streamrNode?.start(this.layer0DhtNode!, this.connectionManager!, this.connectionManager!)
        } else {
            setImmediate(() => this.layer0DhtNode?.joinDht(this.options.layer0.entryPoints![0])) 
            await waitForCondition(() => this.stopped || this.layer0DhtNode!.getNumberOfConnections() > 0)
            await this.streamrNode?.start(this.layer0DhtNode!, this.connectionManager!, this.connectionManager!)
        }
        
    }

    getStreamrNode(): StreamrNode {
        return this.streamrNode!
    }

    getConnectionManager(): ConnectionManager | undefined {
        return this.connectionManager
    }

    getLayer0DhtNode(): DhtNode {
        return this.layer0DhtNode!
    }

    getMetricsContext(): MetricsContext {
        return this.metricsContext
    }

    async stop(): Promise<void> {
        this.stopped = true
        await this.streamrNode!.destroy()
        this.streamrNode = undefined
        this.layer0DhtNode = undefined
        this.connectionManager = undefined
    }

}
