import { StreamMessage, StreamPartID } from 'streamr-client-protocol'
import { Event as NodeEvent, Event, Node, NodeId, NodeOptions } from './Node'

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
        let resolveHandler: any
        let rejectHandler: any
        await Promise.all([
            new Promise<void>((resolve, reject) => {
                resolveHandler = (node: string, stream: StreamPartID) => {
                    if (node === contactNodeId && stream === streamPartId) {
                        resolve()
                    }
                }
                rejectHandler = (node: string, stream: StreamPartID) => {
                    if (node === contactNodeId && stream === streamPartId) {
                        reject(`Joining stream as pure publisher failed on contact-node ${contactNodeId} for stream ${streamPartId}`)
                    }
                }
                this.on(Event.PUBLISH_STREAM_ACCEPTED, resolveHandler)
                this.on(Event.PUBLISH_STREAM_REJECTED, rejectHandler)
            }),
            this.openOutgoingStreamConnection(streamPartId, contactNodeId)
        ]).finally(() => {
            this.off(Event.PUBLISH_STREAM_ACCEPTED, resolveHandler)
            this.off(Event.PUBLISH_STREAM_REJECTED, rejectHandler)
        })
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

    subscribe(streamPartId: StreamPartID): void {
        this.subscribeToStreamIfHaveNotYet(streamPartId)
    }

    async subscribeAndWaitJoin(streamPartId: StreamPartID): Promise<number> {
        return this.subscribeAndWaitForJoinOperation(streamPartId)
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
