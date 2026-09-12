import { logGapDiagnosticEvent, logGapDiagnosticSampled } from '../../GapDiagnostics'
import { ByteRateEstimator } from '../../helpers/ByteRateEstimator'
import { SendQueueStatistics } from '../ConnectionStatistics'

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
}

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

    constructor(channel: DataChannelSendAdapter, options: DataChannelSendQueueOptions) {
        this.channel = channel
        this.bufferThresholdHigh = options.bufferThresholdHigh
        this.now = options.now ?? Date.now
        this.offeredRate = new ByteRateEstimator(1000, 10, this.now)
        this.sentRate = new ByteRateEstimator(1000, 10, this.now)
    }

    /** Send on an open channel with FIFO-guarded backpressure. */
    send(data: Uint8Array): void {
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
            this.push(data)
            this.flush()
        } else if (bufferedAmount > this.bufferThresholdHigh) {
            this.push(data)
        } else {
            this.sendNow(data)
        }
    }

    /** Hold a message without touching the channel (channel not open yet). */
    enqueue(data: Uint8Array): void {
        this.offeredRate.record(data.byteLength)
        this.push(data)
    }

    /** Drain the backlog head-first while the channel has room. */
    flush(): void {
        while ((this.queue.length > 0) && (this.channel.bufferedAmount() < this.bufferThresholdHigh)) {
            const message = this.queue.shift()!
            this.queuedBytes -= message.data.byteLength
            this.sendNow(message.data)
        }
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
            sentBytesPerSecond: this.sentRate.getBytesPerSecond()
        }
    }

    private push(data: Uint8Array): void {
        this.queue.push({ data, enqueuedAt: this.now() })
        this.queuedBytes += data.byteLength
    }

    private sendNow(data: Uint8Array): void {
        this.channel.send(data)
        this.sentRate.record(data.byteLength)
    }
}
