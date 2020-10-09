const LRU = require('lru-cache')

const MAX_ELEMENTS = 50000
const MAX_AGE = 60 * 1000

/**
 * Keeps track of message identifiers that have been seen but not yet propagated to other nodes.
 */
module.exports = class SeenButNotPropagatedSet {
    constructor() {
        this.cache = new LRU({
            max: MAX_ELEMENTS,
            maxAge: MAX_AGE
        })
    }

    add(streamMessage) {
        this.cache.set(SeenButNotPropagatedSet.messageIdToStr(streamMessage.messageId))
    }

    delete(streamMessage) {
        this.cache.del(SeenButNotPropagatedSet.messageIdToStr(streamMessage.messageId))
    }

    has(streamMessage) {
        return this.cache.has(SeenButNotPropagatedSet.messageIdToStr(streamMessage.messageId))
    }

    size() {
        return this.cache.length
    }

    static messageIdToStr({
        streamId, streamPartition, timestamp, sequenceNumber, publisherId, msgChainId
    }) {
        return `${streamId}-${streamPartition}-${timestamp}-${sequenceNumber}-${publisherId}-${msgChainId}`
    }
}
