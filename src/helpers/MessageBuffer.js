module.exports = class MessageBuffer {
    constructor(timeoutInMs, maxSize = 10000, onTimeout = () => {}) {
        this.buffer = {}
        this.timeoutRefs = {}
        this.timeoutInMs = timeoutInMs
        this.maxSize = maxSize
        this.onTimeout = onTimeout
    }

    put(id, message) {
        if (!this._hasBufferFor(id)) {
            this.buffer[id] = []
            this.timeoutRefs[id] = []
        }

        if (this.buffer[id].length >= this.maxSize) {
            this.pop(id)
        }

        this.buffer[id].push(message)
        this.timeoutRefs[id].push(setTimeout(() => {
            this.pop(id)
            this.onTimeout(id)
        }, this.timeoutInMs))
    }

    pop(id) {
        if (this._hasBufferFor(id)) {
            const message = this.buffer[id].shift()
            const ref = this.timeoutRefs[id].shift()
            clearTimeout(ref)

            if (!this.buffer[id].length) {
                delete this.buffer[id]
            }

            return message
        }
        return {}
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
