import { SPID } from 'streamr-client-protocol'
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

    async joinStreamAsPurePublisher(spid: SPID, contactNodeId: string): Promise<void> {
        await this.openOutgoingStreamConnection(spid, contactNodeId)
    }

    async leavePurePublishingStream(spid: SPID, contactNodeId: string): Promise<void> {
        await this.closeOutgoingStreamConnection(spid, contactNodeId)
    }

    addMessageListener<T>(cb: (msg: StreamMessage<T>) => void): void {
        this.on(NodeEvent.UNSEEN_MESSAGE_RECEIVED, cb)
    }

    removeMessageListener<T>(cb: (msg: StreamMessage<T>) => void): void {
        this.off(NodeEvent.UNSEEN_MESSAGE_RECEIVED, cb)
    }

    subscribe(spid: SPID): void {
        this.subscribeToStreamIfHaveNotYet(spid)
    }

    unsubscribe(spid: SPID): void {
        this.unsubscribeFromStream(spid)
    }

    getNeighborsForStream(spid: SPID): ReadonlyArray<NodeId> {
        return this.streams.getNeighborsForStream(spid)
    }

    getRtt(nodeId: NodeId): number|undefined {
        return this.nodeToNode.getRtts()[nodeId]
    }
}
