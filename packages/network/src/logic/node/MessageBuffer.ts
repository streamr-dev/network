interface Buffer<T> {
    [key: string]: Array<T>
}

interface Timeouts {
    [key: string]: Array<NodeJS.Timeout>
}

export class MessageBuffer<M> {
    private readonly buffer: Buffer<M> = {}
    private readonly timeoutRefs: Timeouts = {}
    private readonly timeoutInMs: number
    private readonly maxSize: number
    private readonly onTimeout: (id: string) => void

    constructor(timeoutInMs: number, maxSize = 10000, onTimeout = (_id: string) => {}) {
        this.timeoutInMs = timeoutInMs
        this.maxSize = maxSize
        this.onTimeout = onTimeout
    }

    put(id: string, message: M): void {
        if (!this.buffer[id]) {
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

    pop(id: string): M | null {
        if (this.buffer[id]) {
            const message = this.buffer[id].shift()!
            const ref = this.timeoutRefs[id].shift()!
            clearTimeout(ref)

            if (!this.buffer[id].length) {
                delete this.buffer[id]
            }

            return message
        }
        return null
    }

    popAll(id: string): Array<M> {
        if (this.buffer[id]) {
            const messages = this.buffer[id]
            this.timeoutRefs[id].forEach((ref) => clearTimeout(ref))
            delete this.timeoutRefs[id]
            delete this.buffer[id]
            return messages
        }
        return []
    }

    clear(): void {
        Object.keys(this.buffer).forEach((id) => this.popAll(id))
    }

    size(): number {
        let total = 0
        Object.values(this.buffer).forEach((messages) => {
            total += messages.length
        })
        return total
    }
}
