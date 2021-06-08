import { Node, Event as NodeEvent, NodeOptions } from './logic/Node'
import { StreamIdAndPartition } from './identifiers'
import { MessageLayer } from 'streamr-client-protocol'

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

    /**
     * Publish a message in a "fire-and-forget" manner, attempting to propagate message to neighbors if available.
     * @param streamMessage message to be published
     * @returns number of neighbors message was forwarded to
     */
    publish(streamMessage: MessageLayer.StreamMessage): number {
        return this.onDataReceived(streamMessage)
    }

    /**
     * Publish a message waiting first for at least `minNeighbors` neighbors to be available for a propagation attempt.
     * @param streamMessage message to be published
     * @param minNeighbors minimum number of neighbors that need be available
     * @param timeoutInMs time (in milliseconds) to wait for neighbors to be available
     * @returns number of neighbors message was forwarded to, or, rejection on timeout
     */
    async asyncPublish(
        streamMessage: MessageLayer.StreamMessage,
        minNeighbors = 1,
        timeoutInMs = 8000
    ): Promise<number> {
        const streamId = streamMessage.getStreamId()
        const partition = streamMessage.getStreamPartition()
        this.subscribe(streamId, partition)
        await this.waitForNeighbors(streamId, partition, minNeighbors, timeoutInMs)
        return this.publish(streamMessage)
    }

    /**
     * Set callback function that is invoked each time a new unique message is encountered.
     * @param cb callback function
     */
    addMessageListener(cb: (msg: MessageLayer.StreamMessage) => void): void {
        this.on(NodeEvent.UNSEEN_MESSAGE_RECEIVED, cb)
    }

    removeMessageListener(cb: (msg: MessageLayer.StreamMessage) => void): void {
        this.off(NodeEvent.UNSEEN_MESSAGE_RECEIVED, cb)
    }

    /**
     * Join a stream
     */
    subscribe(streamId: string, streamPartition: number): void {
        this.subscribeToStreamIfHaveNotYet(new StreamIdAndPartition(streamId, streamPartition))
    }

    /**
     * Leave a stream
     */
    unsubscribe(streamId: string, streamPartition: number): void {
        this.unsubscribeFromStream(new StreamIdAndPartition(streamId, streamPartition))
    }

    /**
     * Get number of neighbors for a given StreamPart
     * @param streamId
     * @param streamPartition
     */
    public getNumberOfNeighbors(streamId: string, streamPartition: number): number {
        return this.getNeighborsFor(new StreamIdAndPartition(streamId, streamPartition)).length
    }

    /**
     * Wait until at least the given number of neighbors are available on a stream.
     * @param streamId
     * @param streamPartition
     * @param minNeighbors minimum number of neighbors to a wait for
     * @param timeoutInMs timeout (in milliseconds) after which to give up waiting
     * @returns nubmer of neighbors available
     */
    public async waitForNeighbors(
        streamId: string,
        streamPartition: number,
        minNeighbors = 1,
        timeoutInMs = 8000
    ): Promise<number> {
        return new Promise((resolve, reject) => {
            const hasEnoughNeighbors = () => this.getNumberOfNeighbors(streamId, streamPartition) >= minNeighbors
            const resolveWithNeighborCount = () => resolve(this.getNumberOfNeighbors(streamId, streamPartition))
            if (hasEnoughNeighbors()) {
                resolveWithNeighborCount()
            } else {
                const clear = () => {
                    this.removeListener(NodeEvent.NODE_SUBSCRIBED, eventHandlerFn)
                    clearTimeout(timeoutRef)
                }
                const eventHandlerFn = (_nodeId: string, s: StreamIdAndPartition) => {
                    if (s.id === streamId && s.partition === streamPartition && hasEnoughNeighbors()) {
                        clear()
                        resolveWithNeighborCount()
                    }
                }
                const timeoutRef = setTimeout(() => {
                    clear()
                    reject(new Error(`waitForNeighbors: timed out in ${timeoutInMs} ms`))
                }, timeoutInMs)
                this.on(NodeEvent.NODE_SUBSCRIBED, eventHandlerFn)
            }
        })
    }
}
