module.exports = class MessageBuffer {
    constructor(timeoutInMs, onTimeout = () => {}) {
        this.buffer = {}
        this.timeoutRefs = {}
        this.timeoutInMs = timeoutInMs
        this.onTimeout = onTimeout
    }

    put(id, message) {
        if (!this._hasBufferFor(id)) {
            this.buffer[id] = []
            this.timeoutRefs[id] = []
        }
        this.buffer[id].push(message)
        this.timeoutRefs[id].push(setTimeout(() => {
            this.buffer[id].shift()
            this.timeoutRefs[id].shift()
            this.onTimeout(id)
        }, this.timeoutInMs))
    }

    popAll(id) {
        if (this._hasBufferFor(id)) {
            const messages = this.buffer[id]
            this.timeoutRefs[id].forEach((ref) => clearTimeout(ref))
            delete this.timeoutRefs[id]
            delete this.buffer[id]
            return messages
        }
        return []
    }

    clear() {
        Object.keys(this.buffer).forEach((id) => this.popAll(id))
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
