import { ConnectionManager, DhtNode, DhtNodeOptions } from '@streamr/dht'
import { StreamrNode, StreamrNodeOpts } from './logic/StreamrNode'
import { MetricsContext } from '@streamr/utils'

export interface NetworkOptions {
    layer0: DhtNodeOptions
    networkNode: StreamrNodeOpts
    metricsContext?: MetricsContext
}

export class NetworkStack {

    private connectionManager?: ConnectionManager
    private readonly layer0DhtNode: DhtNode
    private readonly streamrNode: StreamrNode
    private readonly metricsContext: MetricsContext

    constructor(private readonly options: NetworkOptions) {
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
        await this.layer0DhtNode.start()
        this.connectionManager = this.layer0DhtNode.getTransport() as ConnectionManager
        await Promise.all([
            this.layer0DhtNode.joinDht(this.options.layer0.entryPoints![0]),
            this.streamrNode.start(this.layer0DhtNode, this.connectionManager, this.connectionManager)
        ])
    }

    getStreamrNode(): StreamrNode {
        return this.streamrNode
    }

    getConnectionManager(): ConnectionManager | undefined {
        return this.connectionManager
    }

    getLayer0DhtNode(): DhtNode {
        return this.layer0DhtNode
    }

    getMetricsContext(): MetricsContext {
        return this.metricsContext
    }

    async stop(): Promise<void> {
        await this.streamrNode.destroy()
    }

}
