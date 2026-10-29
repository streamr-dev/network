import { Logger } from '@streamr/utils'
import { ChannelSendQueueStatistics, SendQueueChannel, SendQueueHint, SendQueueStatistics } from '../ConnectionStatistics'
import { DataChannelSendAdapter, DataChannelSendQueue } from './DataChannelSendQueue'

const logger = new Logger('DataChannelSet')

export interface DataChannelSetOptions {
    /** high watermark of the reliable channel's queue */
    bufferThresholdHigh: number
    /** high watermark of the media channel's queue, defaults to the reliable one */
    mediaBufferThresholdHigh?: number
    /** test hook, defaults to Date.now */
    now?: () => number
}

/**
 * The send queues of one WebRTC connection: the reliable channel that carries
 * everything, and the optional ordered-but-partially-reliable media channel.
 * Shared by the worker, direct-browser and Node.js connection classes, which
 * own the actual channel objects and tell the set when each one opens or goes
 * away.
 *
 * Routing: a message hinted `channel: 'media'` goes to the media queue while
 * the media channel is open, otherwise to the reliable queue — so a peer
 * without the media channel (an old peer, or one whose channel closed) keeps
 * receiving media over the reliable channel exactly as before. Each queue keeps
 * its own FIFO guard; the two channels are independent SCTP streams and never
 * overtake each other within a channel.
 *
 * A media send that throws (a channel closing under us) is logged and the
 * message dropped: media is lossy by design and `onclose` switches the routing
 * back to reliable.
 */
export class DataChannelSet {

    private readonly queues: Record<SendQueueChannel, DataChannelSendQueue>
    private readonly open: Record<SendQueueChannel, boolean> = { reliable: false, media: false }
    private mediaEverAttached = false
    private mediaDroppedOnDetach = 0
    private mediaSendErrors = 0

    constructor(
        adapters: Record<SendQueueChannel, DataChannelSendAdapter>,
        options: DataChannelSetOptions
    ) {
        const mediaAdapter: DataChannelSendAdapter = {
            bufferedAmount: () => adapters.media.bufferedAmount(),
            send: (data: Uint8Array) => {
                try {
                    adapters.media.send(data)
                } catch (err) {
                    this.mediaSendErrors += 1
                    if (this.mediaSendErrors <= 3) {
                        logger.warn('media channel send failed, message dropped', { err })
                    }
                }
            }
        }
        this.queues = {
            reliable: new DataChannelSendQueue(adapters.reliable, { bufferThresholdHigh: options.bufferThresholdHigh, now: options.now }),
            media: new DataChannelSendQueue(mediaAdapter, {
                bufferThresholdHigh: options.mediaBufferThresholdHigh ?? options.bufferThresholdHigh,
                now: options.now
            })
        }
    }

    /** the channel object is attached and open (media: also marks it as "exists") */
    setOpen(channel: SendQueueChannel, open: boolean): void {
        this.open[channel] = open
        if (channel === 'media' && open) {
            this.mediaEverAttached = true
        }
    }

    isOpen(channel: SendQueueChannel): boolean {
        return this.open[channel]
    }

    hasMediaChannel(): boolean {
        return this.mediaEverAttached
    }

    /** The media channel went away: drop its backlog, route media to reliable from now on. */
    detachMedia(): void {
        this.open.media = false
        const dropped = this.queues.media.size()
        this.mediaDroppedOnDetach += dropped
        this.queues.media.clear()
        if (dropped > 0) {
            logger.debug(`media channel detached, dropped ${dropped} queued messages`)
        }
    }

    private route(hint?: SendQueueHint): SendQueueChannel {
        return (hint?.channel === 'media' && this.open.media) ? 'media' : 'reliable'
    }

    /** Send on an open connection (the reliable channel is open). */
    send(data: Uint8Array, hint?: SendQueueHint): void {
        this.queues[this.route(hint)].send(data, hint)
    }

    /** Hold a message until the reliable channel opens (worker: channel not transferred yet). */
    enqueue(data: Uint8Array, hint?: SendQueueHint): void {
        this.queues.reliable.enqueue(data, hint)
    }

    flush(channel: SendQueueChannel): void {
        this.queues[channel].flush()
    }

    purge(purgeKey: string): number {
        return this.queues.reliable.purge(purgeKey) + this.queues.media.purge(purgeKey)
    }

    clear(): void {
        this.queues.reliable.clear()
        this.queues.media.clear()
    }

    /**
     * The connection-level snapshot is the sum over the channels (the uplink
     * congestion controller reads it per connection; both channels share one
     * SCTP association), with the per-channel breakdown attached once the
     * connection has had a media channel.
     */
    getStatistics(): SendQueueStatistics {
        const reliable = this.queues.reliable.getStatistics()
        if (!this.mediaEverAttached) {
            return reliable
        }
        const media: ChannelSendQueueStatistics = {
            ...this.queues.media.getStatistics(),
            purgedMessages: this.queues.media.getStatistics().purgedMessages + this.mediaDroppedOnDetach
        }
        return {
            bufferedAmount: reliable.bufferedAmount + media.bufferedAmount,
            queuedMessages: reliable.queuedMessages + media.queuedMessages,
            queuedBytes: reliable.queuedBytes + media.queuedBytes,
            oldestQueuedMs: Math.max(reliable.oldestQueuedMs, media.oldestQueuedMs),
            offeredBytesPerSecond: reliable.offeredBytesPerSecond + media.offeredBytesPerSecond,
            sentBytesPerSecond: reliable.sentBytesPerSecond + media.sentBytesPerSecond,
            expiredMessages: reliable.expiredMessages + media.expiredMessages,
            purgedMessages: reliable.purgedMessages + media.purgedMessages,
            channels: { reliable, media }
        }
    }
}
