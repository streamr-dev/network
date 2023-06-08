/* eslint-disable @typescript-eslint/parameter-properties */

import { ConnectionManager, DhtNode, DhtNodeOptions, isSamePeerDescriptor, PeerDescriptor } from '@streamr/dht'
import { StreamrNode, StreamrNodeOpts } from './logic/StreamrNode'
import { MetricsContext, waitForEvent3 } from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'

interface ReadynessEvents {
    done: () => void
}

class ReadynessListener extends EventEmitter<ReadynessEvents> {
    constructor(private networkStack: NetworkStack,
        private dhtNode: DhtNode) {

        super()
        networkStack.on('stopped', this.onStopped)
        networkStack.getLayer0DhtNode().on('connected', this.onConnected)
    }

    private onConnected = (_peerDescriptor: PeerDescriptor) => {
        this.networkStack.off('stopped', this.onStopped)
        this.dhtNode.off('connected', this.onConnected)
        this.emit('done')
    }

    private onStopped = () => {
        this.networkStack.off('stopped', this.onStopped)
        this.dhtNode.off('connected', this.onConnected)
        this.emit('done')
    }
}

export interface NetworkOptions {
    layer0: DhtNodeOptions
    networkNode: StreamrNodeOpts
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
    private stopped = false
    private readonly firstConnectionTimeout: number

    constructor(options: NetworkOptions) {
        super()
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
        this.firstConnectionTimeout = options.networkNode.firstConnectionTimeout || 5000
    }

    async start(): Promise<void> {
        await this.layer0DhtNode!.start()
        this.connectionManager = this.layer0DhtNode!.getTransport() as ConnectionManager
        const entryPoint = this.options.layer0.entryPoints![0]
        if (isSamePeerDescriptor(entryPoint, this.layer0DhtNode!.getPeerDescriptor())) {
            await this.layer0DhtNode?.joinDht(entryPoint)
            await this.streamrNode?.start(this.layer0DhtNode!, this.connectionManager!, this.connectionManager!)
        } else {
            const readynessListener = new ReadynessListener(this, this.layer0DhtNode!)
            const promise = waitForEvent3<ReadynessEvents>(readynessListener, 'done', this.firstConnectionTimeout)

            setImmediate(() => {
                this.layer0DhtNode?.joinDht(this.options.layer0.entryPoints![0])
            })

            await promise
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
        this.emit('stopped')
    }

}
