import LRUCache from 'lru-cache'

const MAX_ELEMENTS = 50000
const MAX_AGE = 60 * 1000

interface MessageId {
    streamId: string
    streamPartition: number
    timestamp: number
    sequenceNumber: number
    publisherId: string
    msgChainId: string
}

type InternalMessageId = string

/**
 * Keeps track of message identifiers that have been seen but not yet propagated to other nodes.
 */
export class SeenButNotPropagatedSet {
    private readonly cache: LRUCache<InternalMessageId, void> = new LRUCache({
        max: MAX_ELEMENTS,
        maxAge: MAX_AGE
    })

    add(streamMessage: { messageId: MessageId }): void {
        this.cache.set(SeenButNotPropagatedSet.messageIdToStr(streamMessage.messageId))
    }

    delete(streamMessage: { messageId: MessageId }): void {
        this.cache.del(SeenButNotPropagatedSet.messageIdToStr(streamMessage.messageId))
    }

    has(streamMessage: { messageId: MessageId }): boolean {
        return this.cache.has(SeenButNotPropagatedSet.messageIdToStr(streamMessage.messageId))
    }

    size(): number {
        return this.cache.length
    }

    static messageIdToStr({
        streamId, streamPartition, timestamp, sequenceNumber, publisherId, msgChainId
    }: MessageId): InternalMessageId {
        return `${streamId}-${streamPartition}-${timestamp}-${sequenceNumber}-${publisherId}-${msgChainId}`
    }
}
