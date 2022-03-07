import { StreamMessage, StreamPartID } from 'streamr-client-protocol'
import { Event as NodeEvent, Node, NodeId, NodeOptions } from './Node'

/*
Convenience wrapper for building client-facing functionality. Used by client.
 */
export class NetworkNode extends Node {
    constructor(opts: NodeOptions) {
        const networkOpts = {
            ...opts
        }
        super(networkOpts)
    }

    setExtraMetadata(metadata: Record<string, unknown>): void {
        this.extraMetadata = metadata
    }

    publish(streamMessage: StreamMessage): void | never {
        const streamPartId = streamMessage.getStreamPartID()
        if (this.isProxiedSubscription(streamPartId)) {
            throw new Error(`Cannot publish to ${streamPartId} as subscribe-only connections have been set`)
        }
        this.onDataReceived(streamMessage)
    }

    async joinStreamPartAsProxyPublisher(streamPartId: StreamPartID, contactNodeId: string): Promise<void> {
        await this.openProxyPublisherStreamConnection(streamPartId, contactNodeId)
    }

    async leaveProxyPublishingStreamPart(streamPartId: StreamPartID, contactNodeId: string): Promise<void> {
        await this.closeProxyPublisherStreamConnection(streamPartId, contactNodeId)
    }

    async joinStreamPartAsProxySubscriber(streamPartId: StreamPartID, contactNodeId: string): Promise<void> {
        await this.openProxySubscriberStreamConnection(streamPartId, contactNodeId)
    }

    async leaveProxySubscribingStreamPart(streamPartId: StreamPartID, contactNodeId: string): Promise<void> {
        await this.closeProxySubscriberStreamConnection(streamPartId, contactNodeId)
    }

    addMessageListener<T>(cb: (msg: StreamMessage<T>) => void): void {
        this.on(NodeEvent.UNSEEN_MESSAGE_RECEIVED, cb)
    }

    removeMessageListener<T>(cb: (msg: StreamMessage<T>) => void): void {
        this.off(NodeEvent.UNSEEN_MESSAGE_RECEIVED, cb)
    }

    subscribe(streamPartId: StreamPartID): void {
        this.subscribeToStreamIfHaveNotYet(streamPartId)
    }

    async subscribeAndWaitForJoin(streamPartId: StreamPartID, timeout?: number): Promise<number> {
        return this.subscribeAndWaitForJoinOperation(streamPartId, timeout)
    }

    async waitForJoinAndPublish(streamMessage: StreamMessage, timeout?: number): Promise<number> {
        const numOfNeighbors = await this.subscribeAndWaitForJoin(streamMessage.getStreamPartID(), timeout)
        this.onDataReceived(streamMessage)
        return numOfNeighbors
    }

    unsubscribe(streamPartId: StreamPartID): void {
        this.unsubscribeFromStream(streamPartId)
    }

    getNeighborsForStreamPart(streamPartId: StreamPartID): ReadonlyArray<NodeId> {
        return this.streamPartManager.getNeighborsForStreamPart(streamPartId)
    }

    isStreamSetUp(streamPartId: StreamPartID): boolean {
        return this.streamPartManager.isSetUp(streamPartId)
    }

    hasProxyPublishConnection(streamPartId: StreamPartID, contactNodeId: NodeId): boolean {
        return this.streamPartManager.hasOutOnlyConnection(streamPartId, contactNodeId)
    }

    hasProxySubscribeConnection(streamPartId: StreamPartID, contactNodeId: NodeId): boolean {
        return this.streamPartManager.hasInOnlyConnection(streamPartId, contactNodeId)
    }

    getRtt(nodeId: NodeId): number|undefined {
        return this.nodeToNode.getRtts()[nodeId]
    }
}
