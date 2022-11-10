import { ConnectionManager, DhtNode, PeerDescriptor } from '@streamr/dht'
import { NetworkNode } from './logic/NetworkNode'

export type NetworkOptions = any

export class NetworkStack {

    private connectionManager?: ConnectionManager
    private readonly layer0DhtNode: DhtNode
    private readonly networkNode: NetworkNode

    constructor(options: NetworkOptions) {

        this.layer0DhtNode = new DhtNode({
            webSocketPort: options.websocketPort,
            numberOfNodesPerKBucket: options.numberOfNodesPerKBucket,
            entryPoints: options.entryPoints || [],
            peerDescriptor: options.peerDescriptor,
            peerIdString: options.peerIdString
        })
        this.networkNode = new NetworkNode()
    }

    async startAll(entryPoint: PeerDescriptor): Promise<void> {
        await this.layer0DhtNode.start()
        this.connectionManager = this.layer0DhtNode.getTransport() as ConnectionManager
        await Promise.all([
            this.layer0DhtNode.joinDht(entryPoint),
            this.networkNode.start(this.layer0DhtNode, this.connectionManager, this.connectionManager)
        ])
    }

    getNetworkNode(): NetworkNode {
        return this.networkNode
    }

    getConnectionManager(): ConnectionManager | undefined {
        return this.connectionManager
    }

    getLayer0DhtNode(): DhtNode {
        return this.layer0DhtNode
    }

}
