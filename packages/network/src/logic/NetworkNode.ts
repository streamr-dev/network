import { StreamMessage, StreamPartID, ProxyDirection, UnicastMessage, MulticastMessage } from 'streamr-client-protocol'
import { Event as NodeEvent, Node, NodeOptions } from './Node'
import { NodeId } from '../identifiers'
import { UserId } from './UserId'
import { Event as NodeToTrackerEvent } from '../protocol/NodeToTracker'

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
        if (this.isProxiedStreamPart(streamPartId, ProxyDirection.SUBSCRIBE)) {
            throw new Error(`Cannot publish to ${streamPartId} as proxy subscribe connections have been set`)
        }
        this.onDataReceived(streamMessage)
    }

    async openProxyConnection(streamPartId: StreamPartID, contactNodeId: string, direction: ProxyDirection): Promise<void> {
        await this.addProxyConnection(streamPartId, contactNodeId, direction)
    }

    async closeProxyConnection(streamPartId: StreamPartID, contactNodeId: string, direction: ProxyDirection): Promise<void> {
        await this.removeProxyConnection(streamPartId, contactNodeId, direction)
    }

    // TODO rename to addBroadcastMessageListener?
    addMessageListener<T>(cb: (msg: StreamMessage<T>) => void): void {
        this.on(NodeEvent.UNSEEN_MESSAGE_RECEIVED, cb)
    }

    // TODO rename to removeBroadcastMessageListener?
    removeMessageListener<T>(cb: (msg: StreamMessage<T>) => void): void {
        this.off(NodeEvent.UNSEEN_MESSAGE_RECEIVED, cb)
    }

    subscribe(streamPartId: StreamPartID): void {
        if (this.isProxiedStreamPart(streamPartId, ProxyDirection.PUBLISH)) {
            throw new Error(`Cannot subscribe to ${streamPartId} as proxy publish connections have been set`)
        }
        this.subscribeToStreamIfHaveNotYet(streamPartId)
    }

    async subscribeAndWaitForJoin(streamPartId: StreamPartID, timeout?: number): Promise<number> {
        if (this.isProxiedStreamPart(streamPartId, ProxyDirection.PUBLISH)) {
            throw new Error(`Cannot subscribe to ${streamPartId} as proxy publish connections have been set`)
        }
        return this.subscribeAndWaitForJoinOperation(streamPartId, timeout)
    }

    async waitForJoinAndPublish(streamMessage: StreamMessage, timeout?: number): Promise<number> {
        const streamPartId = streamMessage.getStreamPartID()
        if (this.isProxiedStreamPart(streamPartId, ProxyDirection.SUBSCRIBE)) {
            throw new Error(`Cannot publish to ${streamPartId} as proxy subscribe connections have been set`)
        }
        const numOfNeighbors = await this.subscribeAndWaitForJoin(streamPartId, timeout)
        this.onDataReceived(streamMessage)
        return numOfNeighbors
    }

    unsubscribe(streamPartId: StreamPartID): void {
        this.unsubscribeFromStream(streamPartId)
    }

    getNeighborsForStreamPart(streamPartId: StreamPartID): ReadonlyArray<NodeId> {
        return this.streamPartManager.isSetUp(streamPartId)
            ? this.streamPartManager.getNeighborsForStreamPart(streamPartId)
            : []
    }

    hasStreamPart(streamPartId: StreamPartID): boolean {
        return this.streamPartManager.isSetUp(streamPartId)
    }

    hasProxyConnection(streamPartId: StreamPartID, contactNodeId: NodeId, direction: ProxyDirection): boolean {
        if (direction === ProxyDirection.PUBLISH) {
            return this.streamPartManager.hasOutOnlyConnection(streamPartId, contactNodeId)
        } else if (direction === ProxyDirection.SUBSCRIBE) {
            return this.streamPartManager.hasInOnlyConnection(streamPartId, contactNodeId)
        } else {
            throw new Error(`Assertion failed expected ProxyDirection but received ${direction}`)
        }
    }

    getRtt(nodeId: NodeId): number | undefined {
        return this.nodeToNode.getRtts()[nodeId]
    }

    async sendUnicastMessage(streamMessage: StreamMessage, recipient: NodeId): Promise<void> {
        await this.trackerManager.sendUnicastMessage(streamMessage, this.peerInfo.peerId, recipient)
    }

    addUnicastMessageListener(listener: (streamMessage: StreamMessage) => void): void {
        const wrappedListener = (from: UnicastMessage) => listener(from.payload)
        this.trackerManager.nodeToTracker.on(NodeToTrackerEvent.UNICAST_MESSAGE_RECEIVED, wrappedListener)
    }

    async sendMulticastMessage(streamMessage: StreamMessage, recipient: UserId): Promise<void> {
        await this.trackerManager.sendMulticastMessage(streamMessage, this.peerInfo.peerId, recipient)
    }

    addMulticastMessageListener(listener: (streamMessage: StreamMessage) => void): void {
        const wrappedListener = (from: MulticastMessage) => listener(from.payload)
        this.trackerManager.nodeToTracker.on(NodeToTrackerEvent.MULTICAST_MESSAGE_RECEIVED, wrappedListener)
    }
}
