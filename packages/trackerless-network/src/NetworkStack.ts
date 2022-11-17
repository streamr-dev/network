import { ConnectionManager, DhtNode } from '@streamr/dht'
import { StreamrNode } from './logic/StreamrNode'

export type NetworkOptions = any

export class NetworkStack {

    private connectionManager?: ConnectionManager
    private readonly layer0DhtNode: DhtNode
    private readonly streamrNode: StreamrNode

    constructor(private readonly options: NetworkOptions) {

        this.layer0DhtNode = new DhtNode({
            webSocketPort: options.websocketPort,
            numberOfNodesPerKBucket: options.numberOfNodesPerKBucket,
            entryPoints: options.entryPoints || [],
            peerDescriptor: options.peerDescriptor,
            peerIdString: options.stringKademliaId,
            transportLayer: options.transportLayer
        })
        this.streamrNode = new StreamrNode()
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

    async stop(): Promise<void> {
        await this.streamrNode.destroy()
    }

}
