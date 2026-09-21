/**
 * Per-connection send/receive statistics.
 *
 * `SendQueueStatistics` is produced synchronously by a connection (WebRTC
 * datachannel send queue or a websocket); `ConnectionStatistics` adds the
 * receive side and is what `ConnectionManager` emits as `statisticsUpdated`.
 * All fields are plain numbers so the objects are structured-clone safe.
 */
export interface SendQueueStatistics {
    /** bytes accepted by the channel/socket but not yet handed to the transport */
    bufferedAmount: number
    /** messages held back in the JS-side backlog (WebRTC only; 0 for websockets) */
    queuedMessages: number
    queuedBytes: number
    /** age of the oldest backlog message in ms, 0 when the backlog is empty */
    oldestQueuedMs: number
    /** bytes passed to send() over the last ~second (direct + queued) */
    offeredBytesPerSecond: number
    /** bytes actually handed to the channel/socket over the last ~second */
    sentBytesPerSecond: number
    /** messages dropped from the backlog because they outlived their `maxQueueAgeMs` (cumulative) */
    expiredMessages: number
    /** messages removed from the backlog by `purge(purgeKey)` (cumulative) */
    purgedMessages: number
}

/**
 * What a sender may say about a message's place in the send queue. Without a
 * hint a message is delivered however long it waits (RPC, control traffic).
 *
 * Live media is different: a frame that waited for seconds behind a slow link
 * is worthless, and delivering it anyway delays every fresher message behind
 * it (one FIFO per connection). `maxQueueAgeMs` lets the queue drop such a
 * message instead of sending it; `purgeKey` lets the owner withdraw everything
 * it queued under a key, e.g. when the receiver has left a stream part.
 */
export interface SendQueueHint {
    maxQueueAgeMs?: number
    purgeKey?: string
}

export interface ConnectionStatistics extends SendQueueStatistics {
    /** queuedBytes + bufferedAmount: the type-independent congestion signal */
    backlogBytes: number
    /** payload bytes received over the last ~second */
    receivedBytesPerSecond: number
    /** Date.now() at sampling */
    sampledAt: number
}

/** Statistics reporting is opt-in: 0 disables the ConnectionManager ticker. */
export const DEFAULT_STATISTICS_INTERVAL = 0
