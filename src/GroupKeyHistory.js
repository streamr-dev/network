/*
This class contains the history of group keys used by the client as a publisher to encrypt messages for a particular stream.
The history is used to answer group key requests from subscribers who may ask for the latest key (getLatestKey() method)
in case of real-time messages or a sequence of historical keys (getKeysBetween() method) in case of resends.
 */
export default class GroupKeyHistory {
    // initialGroupKey is an object with fields "groupKey" and "start"
    constructor(initialGroupKey) {
        this.keys = []
        if (initialGroupKey) {
            this.keys.push(initialGroupKey)
        }
    }

    getLatestKey() {
        return this.keys[this.keys.length - 1]
    }

    getKeysBetween(start, end) {
        if (typeof start !== 'number' || typeof end !== 'number' || start > end) {
            throw new Error('Both "start" and "end" must be defined numbers and "start" must be less than or equal to "end".')
        }
        let i = 0
        // discard keys that ended before 'start'
        while (i < this.keys.length - 1 && this._getKeyEnd(i) < start) {
            i += 1
        }
        const selectedKeys = []
        // add keys as long as they started before 'end'
        while (i < this.keys.length && this.keys[i].start <= end) {
            selectedKeys.push(this.keys[i])
            i += 1
        }
        return selectedKeys
    }

    addKey(groupKey, start) {
        if (this.keys.length > 0 && this.keys[this.keys.length - 1].start > start) {
            throw new Error(`Cannot add an older key to a group key history (${this.keys[this.keys.length - 1].start} > ${start})`)
        }
        this.keys.push({
            groupKey,
            start: start || Date.now()
        })
    }

    _getKeyEnd(keyIndex) {
        if (keyIndex < 0 || keyIndex >= this.keys.length - 1) {
            return undefined
        }
        return this.keys[keyIndex + 1].start - 1
    }
}
