import { Node, Event as NodeEvent, NodeOptions } from './logic/Node'
import { ForeignResendStrategy, LocalResendStrategy } from './resend/resendStrategies'
import { StreamIdAndPartition } from './identifiers'
import { ControlLayer, MessageLayer } from 'streamr-client-protocol'
import ReadableStream = NodeJS.ReadableStream
import { Storage } from './composition'

export interface NetworkNodeOptions extends Omit<NodeOptions, "resendStrategies"> {
    storages: Array<Storage>
}

/*
Convenience wrapper for building client-facing functionality. Used by broker.
 */
export class NetworkNode extends Node {
    constructor(opts: NetworkNodeOptions) {
        const networkOpts = {
            ...opts,
            resendStrategies: [
                ...opts.storages.map((storage) => new LocalResendStrategy(storage)),
                new ForeignResendStrategy(
                    opts.protocols.trackerNode,
                    opts.protocols.nodeToNode,
                    (streamIdAndPartition) => this.getTrackerId(streamIdAndPartition),
                    (node) => this.isNodePresent(node)
                )
            ]
        }
        super(networkOpts)
        opts.storages.forEach((storage) => {
            this.addMessageListener((msg: MessageLayer.StreamMessage) => storage.store(msg))
        })
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

    requestResendLast(
        streamId: string,
        streamPartition: number,
        requestId: string,
        numberLast: number
    ): ReadableStream {
        const request = new ControlLayer.ResendLastRequest({
            requestId, streamId, streamPartition, numberLast, sessionToken: null
        })
        return this.requestResend(request, null)
    }

    requestResendFrom(
        streamId: string,
        streamPartition: number,
        requestId: string,
        fromTimestamp: number,
        fromSequenceNo: number,
        publisherId: string | null
    ): ReadableStream {
        const request = new ControlLayer.ResendFromRequest({
            requestId,
            streamId,
            streamPartition,
            fromMsgRef: new MessageLayer.MessageRef(fromTimestamp, fromSequenceNo),
            publisherId,
            sessionToken: null
        })
        return this.requestResend(request, null)
    }

    requestResendRange(streamId: string,
        streamPartition: number,
        requestId: string,
        fromTimestamp: number,
        fromSequenceNo: number,
        toTimestamp: number,
        toSequenceNo: number,
        publisherId: string | null,
        msgChainId: string | null
    ): ReadableStream {
        const request = new ControlLayer.ResendRangeRequest({
            requestId,
            streamId,
            streamPartition,
            fromMsgRef: new MessageLayer.MessageRef(fromTimestamp, fromSequenceNo),
            toMsgRef: new MessageLayer.MessageRef(toTimestamp, toSequenceNo),
            publisherId,
            msgChainId,
            sessionToken: null
        })
        return this.requestResend(request, null)
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
