import { StreamMessage, StreamPartID } from '@streamr/protocol'
import { PeerDescriptor } from '@streamr/dht'
import { StreamMessageTranslator } from './logic/protocol-integration/stream-message/StreamMessageTranslator'
import { NetworkOptions, NetworkStack } from './NetworkStack'
import { MetricsContext } from '@streamr/utils'
import { ProxyDirection } from './proto/packages/trackerless-network/protos/NetworkRpc'

/*
Convenience wrapper for building client-facing functionality. Used by client.
*/

export class NetworkNode {

    readonly stack: NetworkStack
    private readonly options: NetworkOptions
    private stopped = false
    constructor(opts: NetworkOptions) {
        this.options = opts
        this.stack = new NetworkStack(opts)
    }

    async start(): Promise<void> {
        await this.stack.start()
    }

    setExtraMetadata(metadata: Record<string, unknown>): void {
        this.stack.getStreamrNode().setExtraMetadata(metadata)
    }

    publish(streamMessage: StreamMessage, knownEntrypointDescriptors: PeerDescriptor[]): void | never {
        const streamPartId = streamMessage.getStreamPartID()
        // if (this.isProxiedStreamPart(streamPartId, ProxyDirection.SUBSCRIBE) && streamMessage.messageType === StreamMessageType.MESSAGE) {
        //     throw new Error(`Cannot publish content data to ${streamPartId} as proxy subscribe connections have been set`)
        // }

        const msg = StreamMessageTranslator.toProtobuf(streamMessage)
        this.stack.getStreamrNode().publishToStream(streamPartId, knownEntrypointDescriptors, msg)
    }

    subscribe(streamPartId: StreamPartID, knownEntrypointDescriptors: PeerDescriptor[]): void {
        // if (this.isProxiedStreamPart(streamPartId, ProxyDirection.PUBLISH)) {
        //     throw new Error(`Cannot subscribe to ${streamPartId} as proxy publish connections have been set`)
        // }
        this.stack.getStreamrNode().subscribeToStream(streamPartId, knownEntrypointDescriptors)
    }

    async setProxies(
        streamPartId: StreamPartID,
        contactPeerDescriptors: PeerDescriptor[],
        direction: ProxyDirection,
        getUserId: () => Promise<string>,
        connectionCount?: number
    ): Promise<void> {
        if (this.options.networkNode.acceptProxyConnections) {
            throw new Error('cannot set proxies when acceptProxyConnections=true')
        }
        await this.stack.getStreamrNode().setProxies(streamPartId, contactPeerDescriptors, direction, getUserId, connectionCount)
    }

    addMessageListener<T>(cb: (msg: StreamMessage<T>) => void): void {
        this.stack.getStreamrNode().on('newMessage', (msg) => {
            const translated = StreamMessageTranslator.toClientProtocol<T>(msg)
            return cb(translated)
        })
    }

    removeMessageListener<T>(cb: (msg: StreamMessage<T>) => void): void {
        if (this.stopped) {
            return
        }
        this.stack.getStreamrNode().off('newMessage', (msg) => {
            const translated = StreamMessageTranslator.toClientProtocol<T>(msg)
            return cb(translated)
        })
    }

    async subscribeAndWaitForJoin(
        streamPartId: StreamPartID,
        knownEntrypointDescriptors: PeerDescriptor[],
        timeout?: number,
        expectedNeighbors?: number
    ): Promise<number> {
        // if (this.isProxiedStreamPart(streamPartId, ProxyDirection.PUBLISH)) {
        //     throw new Error(`Cannot subscribe to ${streamPartId} as proxy publish connections have been set`)
        // }
        return this.stack.getStreamrNode().waitForJoinAndSubscribe(streamPartId, knownEntrypointDescriptors, timeout, expectedNeighbors)
    }

    async waitForJoinAndPublish(streamMessage: StreamMessage, knownEntrypointDescriptors: PeerDescriptor[], timeout?: number): Promise<number> {
        const streamPartId = streamMessage.getStreamPartID()
        const msg = StreamMessageTranslator.toProtobuf(streamMessage)

        // if (this.isProxiedStreamPart(streamPartId, ProxyDirection.SUBSCRIBE)) {
        //     throw new Error(`Cannot publish to ${streamPartId} as proxy subscribe connections have been set`)
        // }

        return this.stack.getStreamrNode().waitForJoinAndPublish(streamPartId, knownEntrypointDescriptors, msg, timeout)
    }

    unsubscribe(streamPartId: StreamPartID): void {
        if (this.stopped) {
            return
        }
        this.stack.getStreamrNode().unsubscribeFromStream(streamPartId)
    }

    getNeighborsForStreamPart(streamPartId: StreamPartID): ReadonlyArray<string> {
        return this.hasStreamPart(streamPartId)
            ? this.stack.getStreamrNode().getStream(streamPartId)!.layer2.getTargetNeighborStringIds()
            : []
    }

    hasStreamPart(streamPartId: StreamPartID): boolean {
        return this.stack.getStreamrNode().hasStream(streamPartId)
    }

    // eslint-disable-next-line class-methods-use-this
    hasProxyConnection(_streamPartId: StreamPartID, _contactNodeId: string, _direction: ProxyDirection): boolean {
        // if (direction === ProxyDirection.PUBLISH) {
        //     return this.streamPartManager.hasOutOnlyConnection(streamPartId, contactNodeId)
        // } else if (direction === ProxyDirection.SUBSCRIBE) {
        //     return this.streamPartManager.hasInOnlyConnection(streamPartId, contactNodeId)
        // } else {
        //     throw new Error(`Assertion failed expected ProxyDirection but received ${direction}`)
        // }
        throw new Error('Not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    getRtt(_nodeId: string): number | undefined {
        // return this.nodeToNode.getRtts()[nodeId]
        throw new Error('Not implemented')
    }

    async stop(): Promise<void> {
        this.stopped = true
        await this.stack.stop()
    }

    getMetricsContext(): MetricsContext {
        return this.stack.getMetricsContext()
    }

    getNodeId(): string {
        return this.stack.getStreamrNode().getNodeId()
    }

    getNodeStringId(): string {
        return this.stack.getStreamrNode().getNodeStringId()
    }

    getStreamParts(): StreamPartID[] {
        return this.stack.getStreamrNode().getStreamParts()
    }

    getNeighbors(): string[] {
        return this.stack.getStreamrNode().getNeighbors()
    }

    // eslint-disable-next-line class-methods-use-this
    getDiagnosticInfo(): Record<string, unknown> {
        return {}
    }
}
