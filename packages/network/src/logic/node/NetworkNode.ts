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

    async joinStreamAsPurePublisher(streamId: string, streamPartition: number, contactNodeId: string): Promise<void> {
        await this.openOutgoingStreamConnection(new SPID(streamId, streamPartition), contactNodeId)
    }

    addMessageListener<T>(cb: (msg: StreamMessage<T>) => void): void {
        this.on(NodeEvent.UNSEEN_MESSAGE_RECEIVED, cb)
    }

    removeMessageListener<T>(cb: (msg: StreamMessage<T>) => void): void {
        this.off(NodeEvent.UNSEEN_MESSAGE_RECEIVED, cb)
    }

    subscribe(streamId: string, streamPartition: number): void {
        this.subscribeToStreamIfHaveNotYet(new SPID(streamId, streamPartition))
    }

    unsubscribe(streamId: string, streamPartition: number): void {
        this.unsubscribeFromStream(new SPID(streamId, streamPartition))
    }

    getNeighborsForStream(streamId: string, streamPartition: number): ReadonlyArray<NodeId> {
        return this.streams.getNeighborsForStream(new SPID(streamId, streamPartition))
    }

    getRtt(nodeId: NodeId): number|undefined {
        return this.nodeToNode.getRtts()[nodeId]
    }
}
