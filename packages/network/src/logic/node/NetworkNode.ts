import { StreamPartID } from 'streamr-client-protocol'
import { Node, Event as NodeEvent, NodeOptions, NodeId } from './Node'
import { StreamMessage } from 'streamr-client-protocol'

/*
Convenience wrapper for building client-facing functionality. Used by broker.
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

    publish(streamMessage: StreamMessage): void {
        this.onDataReceived(streamMessage)
    }

    async joinStreamPartAsPurePublisher(streamPartId: StreamPartID, contactNodeId: string): Promise<void> {
        await this.openOutgoingStreamConnection(streamPartId, contactNodeId)
    }

    async leavePurePublishingStreamPart(streamPartId: StreamPartID, contactNodeId: string): Promise<void> {
        await this.closeOutgoingStreamConnection(streamPartId, contactNodeId)
    }

    addMessageListener<T>(cb: (msg: StreamMessage<T>) => void): void {
        this.on(NodeEvent.UNSEEN_MESSAGE_RECEIVED, cb)
    }

    removeMessageListener<T>(cb: (msg: StreamMessage<T>) => void): void {
        this.off(NodeEvent.UNSEEN_MESSAGE_RECEIVED, cb)
    }

    addPurePublishingAcceptedListener(cb: (nodeId: NodeId, streamPartId: StreamPartID) => void): void {
        this.on(NodeEvent.PUBLISH_STREAM_ACCEPTED, cb)
    }

    addPurePublishingRejectedListener(cb: (nodeId: NodeId, streamPartId: StreamPartID) => void): void {
        this.on(NodeEvent.PUBLISH_STREAM_REJECTED, cb)
    }

    removePurePublishingAcceptedListener(cb: (nodeId: NodeId, streamPartId: StreamPartID) => void): void {
        this.off(NodeEvent.PUBLISH_STREAM_ACCEPTED, cb)
    }

    removePurePublishingRejectedListener(cb: (nodeId: NodeId, streamPartId: StreamPartID) => void): void {
        this.off(NodeEvent.PUBLISH_STREAM_REJECTED, cb)
    }

    subscribe(streamPartId: StreamPartID): void {
        this.subscribeToStreamIfHaveNotYet(streamPartId)
    }

    unsubscribe(streamPartId: StreamPartID): void {
        this.unsubscribeFromStream(streamPartId)
    }

    getNeighborsForStreamPart(streamPartId: StreamPartID): ReadonlyArray<NodeId> {
        return this.streamPartManager.getNeighborsForStreamPart(streamPartId)
    }

    getRtt(nodeId: NodeId): number|undefined {
        return this.nodeToNode.getRtts()[nodeId]
    }
}
