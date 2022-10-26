import { StreamrNode } from './StreamrNode'

/*
Convenience wrapper for building client-facing functionality. Used by client.
 */

export class NetworkNode extends StreamrNode {
    // constructor() {
    //     super()
    // }

    // TODO
    // setExtraMetadata(metadata: Record<string, unknown>): void {
    //     this.extraMetadata = metadata
    // }

    // TODO
    // publish(streamMessage: StreamMessage): void | never {
    //     const streamPartId = streamMessage.getStreamPartID()
    //     if (this.isProxiedStreamPart(streamPartId, ProxyDirection.SUBSCRIBE) && streamMessage.messageType === StreamMessageType.MESSAGE) {
    //         throw new Error(`Cannot publish content data to ${streamPartId} as proxy subscribe connections have been set`)
    //     }
    //     this.onDataReceived(streamMessage)
    // }

    // TODO:
    // async openProxyConnection(streamPartId: StreamPartID, contactNodeId: string, direction: ProxyDirection, userId: string): Promise<void> {
    //     await this.addProxyConnection(streamPartId, contactNodeId, direction, userId)
    // }

    // TODO:
    // async closeProxyConnection(streamPartId: StreamPartID, contactNodeId: string, direction: ProxyDirection): Promise<void> {
    //     await this.removeProxyConnection(streamPartId, contactNodeId, direction)
    // }

    // TODO
    // addMessageListener<T>(cb: (msg: StreamMessage<T>) => void): void {
    //     this.on(NodeEvent.UNSEEN_MESSAGE_RECEIVED, cb)
    // }

    // TODO
    // removeMessageListener<T>(cb: (msg: StreamMessage<T>) => void): void {
    //     this.off(NodeEvent.UNSEEN_MESSAGE_RECEIVED, cb)
    // }

    // TODO
    // subscribe(streamPartId: StreamPartID): void {
    //     if (this.isProxiedStreamPart(streamPartId, ProxyDirection.PUBLISH)) {
    //         throw new Error(`Cannot subscribe to ${streamPartId} as proxy publish connections have been set`)
    //     }
    //     this.subscribeToStreamIfHaveNotYet(streamPartId)
    // }

    // TODO
    // async subscribeAndWaitForJoin(streamPartId: StreamPartID, timeout?: number): Promise<number> {
    //     if (this.isProxiedStreamPart(streamPartId, ProxyDirection.PUBLISH)) {
    //         throw new Error(`Cannot subscribe to ${streamPartId} as proxy publish connections have been set`)
    //     }
    //     return this.subscribeAndWaitForJoinOperation(streamPartId, timeout)
    // }

    // TODO
    // async waitForJoinAndPublish(streamMessage: StreamMessage, timeout?: number): Promise<number> {
    //     const streamPartId = streamMessage.getStreamPartID()
    //     if (this.isProxiedStreamPart(streamPartId, ProxyDirection.SUBSCRIBE)) {
    //         throw new Error(`Cannot publish to ${streamPartId} as proxy subscribe connections have been set`)
    //     }
    //     const numOfNeighbors = await this.subscribeAndWaitForJoin(streamPartId, timeout)
    //     this.onDataReceived(streamMessage)
    //     return numOfNeighbors
    // }

    // TODO
    // unsubscribe(streamPartId: StreamPartID): void {
    //     this.unsubscribeFromStream(streamPartId)
    // }

    // TODO
    // getNeighborsForStreamPart(streamPartId: StreamPartID): ReadonlyArray<NodeId> {
    //     return this.streamPartManager.isSetUp(streamPartId)
    //         ? this.streamPartManager.getNeighborsForStreamPart(streamPartId)
    //         : []
    // }

    // TODO
    // hasStreamPart(streamPartId: StreamPartID): boolean {
    //     return this.streamPartManager.isSetUp(streamPartId)
    // }

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
