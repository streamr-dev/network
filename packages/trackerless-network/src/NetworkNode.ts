import { Event as NodeEvent } from './logic/StreamrNode'
import { ProxyDirection, StreamMessage, StreamPartID } from '@streamr/protocol'
import { PeerDescriptor } from '@streamr/dht'
import { StreamMessageTranslator } from './logic/protocol-integration/stream-message/StreamMessageTranslator'
import { NetworkOptions, NetworkStack } from './NetworkStack'

/*
Convenience wrapper for building client-facing functionality. Used by client.
 */

export class NetworkNode {

    readonly stack: NetworkStack

    constructor(opts: NetworkOptions) {
        this.stack = new NetworkStack(opts)
    }

    async start(): Promise<void> {
        await this.stack.start()
    }

    setExtraMetadata(metadata: Record<string, unknown>): void {
        this.stack.getStreamrNode().setExtraMetadata(metadata)
    }

    publish(streamMessage: StreamMessage, entrypointDescriptor: PeerDescriptor): void | never {
        const streamPartId = streamMessage.getStreamPartID()
        // if (this.isProxiedStreamPart(streamPartId, ProxyDirection.SUBSCRIBE) && streamMessage.messageType === StreamMessageType.MESSAGE) {
        //     throw new Error(`Cannot publish content data to ${streamPartId} as proxy subscribe connections have been set`)
        // }

        console.log("PUBLISHING!!!!")
        const msg = StreamMessageTranslator.toProtobuf(streamMessage)
        this.stack.getStreamrNode().publishToStream(streamPartId, entrypointDescriptor, msg)
    }

    subscribe(streamPartId: StreamPartID, entrypointDescriptor: PeerDescriptor): void {
        // if (this.isProxiedStreamPart(streamPartId, ProxyDirection.PUBLISH)) {
        //     throw new Error(`Cannot subscribe to ${streamPartId} as proxy publish connections have been set`)
        // }
        this.stack.getStreamrNode().subscribeToStream(streamPartId, entrypointDescriptor)
    }

    // eslint-disable-next-line class-methods-use-this
    async openProxyConnection(_streamPartId: StreamPartID, _contactNodeId: string, _direction: ProxyDirection, _userId: string): Promise<void> {
        // await this.addProxyConnection(streamPartId, contactNodeId, direction, userId)
        throw new Error('Not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    async closeProxyConnection(_streamPartId: StreamPartID, _contactNodeId: string, _direction: ProxyDirection): Promise<void> {
        // await this.removeProxyConnection(streamPartId, contactNodeId, direction)
        throw new Error('Not implemented')
    }

    addMessageListener(cb: (msg: StreamMessage) => void): void {
        this.stack.getStreamrNode().on(NodeEvent.NEW_MESSAGE, (msg) => {
            const translated = StreamMessageTranslator.toClientProtocol(msg)
            return cb(translated)
        })
    }

    removeMessageListener(cb: (msg: StreamMessage) => void): void {
        this.stack.getStreamrNode().off(NodeEvent.NEW_MESSAGE, cb)
    }

    async subscribeAndWaitForJoin(streamPartId: StreamPartID, entrypointDescriptor: PeerDescriptor, _timeout?: number): Promise<number> {
        // if (this.isProxiedStreamPart(streamPartId, ProxyDirection.PUBLISH)) {
        //     throw new Error(`Cannot subscribe to ${streamPartId} as proxy publish connections have been set`)
        // }
        return this.stack.getStreamrNode().subscribeAndWaitForJoin(streamPartId, entrypointDescriptor)
    }

    async waitForJoinAndPublish(streamMessage: StreamMessage, entrypointDescriptor: PeerDescriptor, _timeout?: number): Promise<number> {
        const streamPartId = streamMessage.getStreamPartID()
        const msg = StreamMessageTranslator.toProtobuf(streamMessage)

        // if (this.isProxiedStreamPart(streamPartId, ProxyDirection.SUBSCRIBE)) {
        //     throw new Error(`Cannot publish to ${streamPartId} as proxy subscribe connections have been set`)
        // }

        return this.stack.getStreamrNode().waitForJoinAndPublish(streamPartId, entrypointDescriptor, msg)
    }

    unsubscribe(streamPartId: StreamPartID): void {
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
        await this.stack.stop()
    }

    // eslint-disable-next-line class-methods-use-this
    getMetricsContext(): any {
        throw new Error('Not implemented')
    }

    getNodeId(): string {
        return this.stack.getStreamrNode().getNodeId()
    }

    getStreamParts(): StreamPartID[] {
        return this.stack.getStreamrNode().getStreamParts()
    }

    getNeighbors(): string[] {
        return this.stack.getStreamrNode().getNeighbors()
    }
}
