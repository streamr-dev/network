import { ConnectionManager, DhtNode } from '@streamr/dht'
import { StreamrNode } from './logic/StreamrNode'
import { MetricsContext } from '@streamr/utils'

export type NetworkOptions = any

export class NetworkStack {

    private connectionManager?: ConnectionManager
    private readonly layer0DhtNode: DhtNode
    private readonly streamrNode: StreamrNode
    private readonly metricsContext: MetricsContext
    private readonly options: NetworkOptions

    constructor(options: NetworkOptions) {
        this.options = options
        this.metricsContext = options.metricsContext || new MetricsContext()
        this.layer0DhtNode = new DhtNode({
            webSocketPort: options.websocketPort,
            numberOfNodesPerKBucket: options.numberOfNodesPerKBucket,
            entryPoints: options.entryPoints || [],
            peerDescriptor: options.peerDescriptor,
            peerIdString: options.stringKademliaId,
            transportLayer: options.transportLayer,
            metricsContext: this.metricsContext
        })
        this.streamrNode = new StreamrNode({
            metricsContext: this.metricsContext
        })
    }

    async start(): Promise<void> {
        await this.layer0DhtNode.start()
        this.connectionManager = this.layer0DhtNode.getTransport() as ConnectionManager
        await Promise.all([
            this.layer0DhtNode.joinDht(this.options.entryPoints[0]),
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
