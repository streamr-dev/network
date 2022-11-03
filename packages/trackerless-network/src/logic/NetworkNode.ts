import { StreamrNode, Event as NodeEvent } from './StreamrNode'
import { StreamMessage, StreamPartID } from 'streamr-client-protocol'
import { PeerDescriptor } from '@streamr/dht'
import { StreamMessageTranslator } from './protocol-integration/stream-message/StreamMessageTranslator'
import { waitForCondition } from 'streamr-test-utils'

/*
Convenience wrapper for building client-facing functionality. Used by client.
 */

export class NetworkNode extends StreamrNode {

    // TODO
    // setExtraMetadata(metadata: Record<string, unknown>): void {
    //     this.extraMetadata = metadata
    // }

    publish(streamMessage: StreamMessage, entrypointDescriptor: PeerDescriptor): void | never {
        const streamPartId = streamMessage.getStreamPartID()
        // if (this.isProxiedStreamPart(streamPartId, ProxyDirection.SUBSCRIBE) && streamMessage.messageType === StreamMessageType.MESSAGE) {
        //     throw new Error(`Cannot publish content data to ${streamPartId} as proxy subscribe connections have been set`)
        // }

        const msg = StreamMessageTranslator.toProtobuf(streamMessage)
        this.publishToStream(streamPartId, entrypointDescriptor, msg)
    }

    subscribe(streamPartId: StreamPartID, entrypointDescriptor: PeerDescriptor): void {
        // if (this.isProxiedStreamPart(streamPartId, ProxyDirection.PUBLISH)) {
        //     throw new Error(`Cannot subscribe to ${streamPartId} as proxy publish connections have been set`)
        // }
        this.subscribeToStream(streamPartId, entrypointDescriptor)
    }

    // TODO:
    // async openProxyConnection(streamPartId: StreamPartID, contactNodeId: string, direction: ProxyDirection, userId: string): Promise<void> {
    //     await this.addProxyConnection(streamPartId, contactNodeId, direction, userId)
    // }

    // TODO:
    // async closeProxyConnection(streamPartId: StreamPartID, contactNodeId: string, direction: ProxyDirection): Promise<void> {
    //     await this.removeProxyConnection(streamPartId, contactNodeId, direction)
    // }

    addMessageListener<T>(cb: (msg: StreamMessage<T>) => void): void {
        this.on(NodeEvent.NEW_MESSAGE, (msg) => {
            const translated = StreamMessageTranslator.toClientProtocol<T>(msg)
            return cb(translated)
        })
    }

    removeMessageListener<T>(cb: (msg: StreamMessage<T>) => void): void {
        this.off(NodeEvent.NEW_MESSAGE, cb)
    }

    async subscribeAndWaitForJoin(streamPartId: StreamPartID, entrypointDescriptor: PeerDescriptor, _timeout?: number): Promise<number> {
        // if (this.isProxiedStreamPart(streamPartId, ProxyDirection.PUBLISH)) {
        //     throw new Error(`Cannot subscribe to ${streamPartId} as proxy publish connections have been set`)
        // }
        await this.joinStream(streamPartId, entrypointDescriptor)
        this.subscribeToStream(streamPartId, entrypointDescriptor)
        return this.getStream(streamPartId)?.layer2.getTargetNeighborStringIds().length || 0
    }

    async waitForJoinAndPublish(streamMessage: StreamMessage, entrypointDescriptor: PeerDescriptor, _timeout?: number): Promise<number> {
        const streamPartId = streamMessage.getStreamPartID()
        // if (this.isProxiedStreamPart(streamPartId, ProxyDirection.SUBSCRIBE)) {
        //     throw new Error(`Cannot publish to ${streamPartId} as proxy subscribe connections have been set`)
        // }
        await this.joinStream(streamPartId, entrypointDescriptor)
        if (this.getStream(streamPartId)!.layer1.getBucketSize() > 0) {
            await waitForCondition(() => this.getStream(streamPartId)!.layer2.getTargetNeighborStringIds().length > 0)
        }
        const msg = StreamMessageTranslator.toProtobuf(streamMessage)
        this.publishToStream(streamPartId, entrypointDescriptor, msg)
        return this.getStream(streamPartId)?.layer2.getTargetNeighborStringIds().length || 0
    }

    unsubscribe(streamPartId: StreamPartID): void {
        this.unsubscribeFromStream(streamPartId)
    }

    // TODO
    // getNeighborsForStreamPart(streamPartId: StreamPartID): ReadonlyArray<NodeId> {
    //     return this.streamPartManager.isSetUp(streamPartId)
    //         ? this.streamPartManager.getNeighborsForStreamPart(streamPartId)
    //         : []
    // }

    hasStreamPart(streamPartId: StreamPartID): boolean {
        return this.hasStream(streamPartId)
    }

    // TODO
    // hasProxyConnection(streamPartId: StreamPartID, contactNodeId: NodeId, direction: ProxyDirection): boolean {
    //     if (direction === ProxyDirection.PUBLISH) {
    //         return this.streamPartManager.hasOutOnlyConnection(streamPartId, contactNodeId)
    //     } else if (direction === ProxyDirection.SUBSCRIBE) {
    //         return this.streamPartManager.hasInOnlyConnection(streamPartId, contactNodeId)
    //     } else {
    //         throw new Error(`Assertion failed expected ProxyDirection but received ${direction}`)
    //     }
    // }

    // TODO
    // getRtt(nodeId: NodeId): number | undefined {
    //     return this.nodeToNode.getRtts()[nodeId]
    // }
}
