import { logGapDiagnosticEvent, logGapDiagnosticSampled } from '../../GapDiagnostics'
import { ByteRateEstimator } from '../../helpers/ByteRateEstimator'
import { SendQueueStatistics, SendQueueHint } from '../ConnectionStatistics'

/** Minimal view of an RTCDataChannel / node-datachannel DataChannel. */
export interface DataChannelSendAdapter {
    /** must return a number even before the channel exists (return 0) */
    bufferedAmount(): number
    /** may throw (browser) — errors propagate to the caller exactly as before */
    send(data: Uint8Array): void
}

export interface DataChannelSendQueueOptions {
    bufferThresholdHigh: number
    /** test hook, defaults to Date.now */
    now?: () => number
}

interface QueuedMessage {
    data: Uint8Array
    enqueuedAt: number
    maxQueueAgeMs?: number
    purgeKey?: string
}

/** how often a send() sweeps the whole backlog for expired messages */
const EXPIRY_SWEEP_INTERVAL_MS = 250

/**
 * Backpressure queue in front of a WebRTC datachannel, shared by the worker,
 * direct-browser and Node.js connection implementations.
 *
 * Messages go straight to the channel while its `bufferedAmount` is at or
 * below the high watermark; above it they are held in a FIFO that drains on
 * `bufferedamountlow`. While anything is queued, EVERY new message goes to the
 * back of the queue — a fresh message must never overtake the backlog, because
 * the receiver's duplicate detector would then reject everything behind it.
 *
 * A message sent with a `SendQueueHint.maxQueueAgeMs` is dropped instead of
 * sent once it has waited longer than that; the order of the surviving
 * messages never changes. Messages without the hint are always delivered.
 *
 * The queue also keeps the counters behind `SendQueueStatistics`: backlog
 * size/age plus offered vs. actually-sent byte rates.
 */
export class DataChannelSendQueue {

    private readonly channel: DataChannelSendAdapter
    private readonly bufferThresholdHigh: number
    private readonly now: () => number
    private readonly queue: QueuedMessage[] = []
    private queuedBytes = 0
    private readonly offeredRate: ByteRateEstimator
    private readonly sentRate: ByteRateEstimator
    private expiredMessages = 0
    private purgedMessages = 0
    private lastExpirySweepAt = 0

    constructor(channel: DataChannelSendAdapter, options: DataChannelSendQueueOptions) {
        this.channel = channel
        this.bufferThresholdHigh = options.bufferThresholdHigh
        this.now = options.now ?? Date.now
        this.offeredRate = new ByteRateEstimator(1000, 10, this.now)
        this.sentRate = new ByteRateEstimator(1000, 10, this.now)
    }

    /** Send on an open channel with FIFO-guarded backpressure. */
    send(data: Uint8Array, hint?: SendQueueHint): void {
        this.sweepExpired()
        const bufferedAmount = this.channel.bufferedAmount()
        logGapDiagnosticSampled('dht.dc.send', {
            detail: { bufferedAmount, queueLen: this.queue.length }
        })
        this.offeredRate.record(data.byteLength)
        if (this.queue.length > 0) {
            if (bufferedAmount <= this.bufferThresholdHigh) {
                logGapDiagnosticEvent('dht.dc.orderGuard', {
                    queueLen: this.queue.length, bufferedAmount
                })
            }
            this.push(data, hint)
            this.flush()
        } else if (bufferedAmount > this.bufferThresholdHigh) {
            this.push(data, hint)
        } else {
            this.sendNow(data)
        }
    }

    /** Hold a message without touching the channel (channel not open yet). */
    enqueue(data: Uint8Array, hint?: SendQueueHint): void {
        this.offeredRate.record(data.byteLength)
        this.push(data, hint)
    }

    /** Drain the backlog head-first while the channel has room; expired messages are skipped. */
    flush(): void {
        const now = this.now()
        while ((this.queue.length > 0) && (this.channel.bufferedAmount() < this.bufferThresholdHigh)) {
            const message = this.queue.shift()!
            this.queuedBytes -= message.data.byteLength
            if (this.isExpired(message, now)) {
                this.expiredMessages += 1
                continue
            }
            this.sendNow(message.data)
        }
    }

    /**
     * Withdraw every queued message sent under `purgeKey` (e.g. the receiver
     * left the stream part they belong to). Returns how many were removed.
     */
    purge(purgeKey: string): number {
        const removed = this.removeWhere((message) => message.purgeKey === purgeKey)
        this.purgedMessages += removed
        return removed
    }

    /** Drop the backlog (connection closing). */
    clear(): void {
        this.queue.length = 0
        this.queuedBytes = 0
    }

    size(): number {
        return this.queue.length
    }

    getStatistics(): SendQueueStatistics {
        return {
            bufferedAmount: this.channel.bufferedAmount(),
            queuedMessages: this.queue.length,
            queuedBytes: this.queuedBytes,
            oldestQueuedMs: (this.queue.length > 0) ? Math.max(0, this.now() - this.queue[0].enqueuedAt) : 0,
            offeredBytesPerSecond: this.offeredRate.getBytesPerSecond(),
            sentBytesPerSecond: this.sentRate.getBytesPerSecond(),
            expiredMessages: this.expiredMessages,
            purgedMessages: this.purgedMessages
        }
    }

    private push(data: Uint8Array, hint?: SendQueueHint): void {
        this.queue.push({
            data,
            enqueuedAt: this.now(),
            maxQueueAgeMs: hint?.maxQueueAgeMs,
            purgeKey: hint?.purgeKey
        })
        this.queuedBytes += data.byteLength
    }

    // eslint-disable-next-line class-methods-use-this
    private isExpired(message: QueuedMessage, now: number): boolean {
        return (message.maxQueueAgeMs !== undefined) && (now - message.enqueuedAt > message.maxQueueAgeMs)
    }

    /**
     * While the channel is stuck nothing drains, so expired messages would
     * otherwise sit in memory (and in the statistics) until it moves again.
     */
    private sweepExpired(): void {
        const now = this.now()
        if ((this.queue.length === 0) || (now - this.lastExpirySweepAt < EXPIRY_SWEEP_INTERVAL_MS)) {
            return
        }
        this.lastExpirySweepAt = now
        this.expiredMessages += this.removeWhere((message) => this.isExpired(message, now))
    }

    /** removes matching messages, keeping the order of the rest */
    private removeWhere(predicate: (message: QueuedMessage) => boolean): number {
        let kept = 0
        for (const message of this.queue) {
            if (predicate(message)) {
                this.queuedBytes -= message.data.byteLength
            } else {
                this.queue[kept] = message
                kept += 1
            }
        }
        const removed = this.queue.length - kept
        this.queue.length = kept
        return removed
    }

    private sendNow(data: Uint8Array): void {
        this.channel.send(data)
        this.sentRate.record(data.byteLength)
    }
}
