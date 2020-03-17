const LRU = require('lru-cache')

module.exports = class MessageBuffer {
    constructor(timeoutInMs, maxSize = 10000) {
        this.buffer = {}
        this.timeoutInMs = timeoutInMs
        this.maxSize = maxSize
        this.pruneInterval = null
    }

    put(id, message) {
        if (!this._hasBufferFor(id)) {
            this.buffer[id] = new LRU({
                max: this.maxSize,
                maxAge: this.timeoutInMs
            })
        }

        this.buffer[id].set(message, true)

        // 'lru-cache' library itself does not pro-actively prune items as they get old
        if (this.pruneInterval === null) {
            this.pruneInterval = setInterval(() => {
                Object.values(this.buffer).forEach((messages) => messages.prune())
            }, this.timeoutInMs)
        }
    }

    popAll(id) {
        if (this._hasBufferFor(id)) {
            const messages = []
            if (this.buffer[id].length) {
                this.buffer[id].rforEach((value, key) => messages.push(key))
            }
            this.buffer[id].reset()
            delete this.buffer[id]
            return messages
        }
        return []
    }

    clear() {
        Object.keys(this.buffer).forEach((id) => this.popAll(id))
        clearInterval(this.pruneInterval)
        this.pruneInterval = null
    }

    size() {
        let total = 0
        Object.values(this.buffer).forEach((messages) => {
            total += messages.length
        })
        return total
    }

    _hasBufferFor(id) {
        return this.buffer[id]
    }
}
