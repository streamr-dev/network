import { StreamMessage, StreamPartID, StreamMessageType } from '@streamr/protocol'
import { PeerDescriptor, PeerID, PeerIDKey, peerIdFromPeerDescriptor } from '@streamr/dht'
import { StreamMessageTranslator } from './logic/protocol-integration/stream-message/StreamMessageTranslator'
import { NetworkOptions, NetworkStack } from './NetworkStack'
import { MetricsContext } from '@streamr/utils'
import { ProxyDirection } from './proto/packages/trackerless-network/protos/NetworkRpc'
import { NodeId } from './identifiers'

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

    async start(doJoin?: boolean): Promise<void> {
        await this.stack.start(doJoin)
    }

    setExtraMetadata(metadata: Record<string, unknown>): void {
        this.stack.getStreamrNode().setExtraMetadata(metadata)
    }

    async publish(streamMessage: StreamMessage): Promise<void> {
        const streamPartId = streamMessage.getStreamPartID()
        if (this.stack.getStreamrNode().isProxiedStreamPart(streamPartId, ProxyDirection.SUBSCRIBE) 
            && streamMessage.messageType === StreamMessageType.MESSAGE) {
            throw new Error(`Cannot publish content data to ${streamPartId} as proxy subscribe connections have been set`)
        }

        await this.stack.joinLayer0IfRequired(streamPartId)
        const msg = StreamMessageTranslator.toProtobuf(streamMessage)
        this.stack.getStreamrNode().publishToStream(streamPartId, msg)
    }

    async subscribe(streamPartId: StreamPartID): Promise<void> {
        if (this.stack.getStreamrNode().isProxiedStreamPart(streamPartId, ProxyDirection.PUBLISH)) {
            throw new Error(`Cannot subscribe to ${streamPartId} as proxy publish connections have been set`)
        }
        await this.stack.joinLayer0IfRequired(streamPartId)
        this.stack.getStreamrNode().subscribeToStream(streamPartId)
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

    setStreamPartEntryPoints(streamPartId: StreamPartID, contactPeerDescriptors: PeerDescriptor[]): void {
        this.stack.getStreamrNode()!.setStreamPartEntryPoints(streamPartId, contactPeerDescriptors)
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
        timeout?: number,
        expectedNeighbors?: number
    ): Promise<number> {
        if (this.stack.getStreamrNode()!.isProxiedStreamPart(streamPartId, ProxyDirection.PUBLISH)) {
            throw new Error(`Cannot subscribe to ${streamPartId} as proxy publish connections have been set`)
        }
        return this.stack.getStreamrNode().waitForJoinAndSubscribe(streamPartId, timeout, expectedNeighbors)
    }

    async waitForJoinAndPublish(streamMessage: StreamMessage, timeout?: number): Promise<number> {
        const streamPartId = streamMessage.getStreamPartID()
        const msg = StreamMessageTranslator.toProtobuf(streamMessage)

        if (this.stack.getStreamrNode()!.isProxiedStreamPart(streamPartId, ProxyDirection.SUBSCRIBE)) {
            throw new Error(`Cannot publish to ${streamPartId} as proxy subscribe connections have been set`)
        }

        return this.stack.getStreamrNode().waitForJoinAndPublish(streamPartId, msg, timeout)
    }

    unsubscribe(streamPartId: StreamPartID): void {
        if (this.stopped) {
            return
        }
        this.stack.getStreamrNode().unsubscribeFromStream(streamPartId)
    }

    async findPeer(id: NodeId): Promise<PeerDescriptor | undefined> {
        const searchedId = PeerID.fromKey(id as PeerIDKey)
        const result = await this.stack.getLayer0DhtNode()!.startRecursiveFind(searchedId.value)
        const closest = result.closestNodes[0]
        if (closest) {
            const closestPeerId = peerIdFromPeerDescriptor(closest)
            return closestPeerId.equals(searchedId) ? closest : undefined
        }
        return undefined
    }

    getNeighborsForStreamPart(streamPartId: StreamPartID): ReadonlyArray<string> {
        return this.hasStreamPart(streamPartId)
            ? this.stack.getStreamrNode().getStream(streamPartId)!.layer2.getTargetNeighborStringIds()
            : []
    }

    hasStreamPart(streamPartId: StreamPartID): boolean {
        return this.stack.getStreamrNode().hasStream(streamPartId)
    }

    hasProxyConnection(streamPartId: StreamPartID, contactNodeId: string, direction: ProxyDirection): boolean {
        return this.stack.getStreamrNode()!.hasProxyConnection(streamPartId, contactNodeId as PeerIDKey, direction)
    }

    // eslint-disable-next-line class-methods-use-this
    getRtt(_nodeId: string): number | undefined {
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
