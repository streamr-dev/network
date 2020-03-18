export default class LatestKeyStorageUtil {
    constructor(publisherGroupKeys = {}) {
        this.latestKeys = publisherGroupKeys
    }

    hasKey(streamId) {
        return this.latestKeys[streamId] !== undefined
    }

    getLatestKey(streamId) {
        return this.latestKeys[streamId]
    }

    /* eslint-disable class-methods-use-this */
    getKeysBetween(streamId, start, end) {
        throw new Error(`Cannot retrieve historical keys for stream ${streamId} between ${start} and ${end} because only the latest key is stored.
         Set options.publisherStoreKeyHistory to true to store all historical keys.`)
    }
    /* eslint-enable class-methods-use-this */

    addKey(streamId, groupKey, start) {
        if (this.latestKeys[streamId] && this.latestKeys[streamId].start > start) {
            throw new Error(`Cannot add an older key as latest key (${this.latestKeys[streamId].start} > ${start})`)
        }
        this.latestKeys[streamId] = {
            groupKey,
            start
        }
    }
}
