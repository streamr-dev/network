import GroupKeyHistory from './GroupKeyHistory'

export default class KeyHistoryStorageUtil {
    constructor(publisherGroupKeys = {}) {
        this.groupKeyHistories = {}
        Object.keys(publisherGroupKeys).forEach((streamId) => {
            this.groupKeyHistories[streamId] = new GroupKeyHistory(publisherGroupKeys[streamId])
        })
    }

    hasKey(streamId) {
        return this.groupKeyHistories[streamId] !== undefined
    }

    getLatestKey(streamId) {
        if (this.groupKeyHistories[streamId]) {
            return this.groupKeyHistories[streamId].getLatestKey()
        }
        return undefined
    }

    getKeysBetween(streamId, start, end) {
        if (this.groupKeyHistories[streamId]) {
            return this.groupKeyHistories[streamId].getKeysBetween(start, end)
        }
        return []
    }

    addKey(streamId, groupKey, start) {
        if (!this.groupKeyHistories[streamId]) {
            this.groupKeyHistories[streamId] = new GroupKeyHistory()
        }
        this.groupKeyHistories[streamId].addKey(groupKey, start)
    }
}
