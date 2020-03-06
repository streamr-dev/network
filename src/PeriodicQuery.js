const EventEmitter = require('events')
const Stream = require('stream')

module.exports = class PeriodicQuery extends EventEmitter {
    constructor(queryFunction, retryInterval, retryTimeout) {
        super()
        this.queryFunction = queryFunction
        this.retryInterval = retryInterval
        this.retryTimeout = retryTimeout
        this.readableStream = new Stream.Readable({
            objectMode: true,
            read() {},
        })
    }

    async _startFetching() {
        let dataSeen = false
        const queryStream = this.queryFunction()
        queryStream.on('data', (d) => this.readableStream.push(d))
        queryStream.once('data', () => {
            dataSeen = true
        })
        queryStream.once('end', () => {
            if (dataSeen) {
                this.clear()
                this.readableStream.push(null)
            } else {
                this.interval = setInterval(async () => {
                    const stream = this.queryFunction()
                    stream.on('data', (d) => this.readableStream.push(d))
                    stream.once('data', () => {
                        dataSeen = true
                    })
                    stream.once('end', () => {
                        if (dataSeen) {
                            this.clear()
                            this.readableStream.push(null)
                        }
                    })
                }, this.retryInterval)
                this.timeout = setTimeout(() => {
                    this.clear()
                    this.readableStream.push(null)
                }, this.retryTimeout)
            }
        })
    }

    getStreamingResults() {
        this._startFetching()
        return this.readableStream
    }

    clear() {
        if (this.interval) {
            clearInterval(this.interval)
        }
        if (this.timeout) {
            clearTimeout(this.timeout)
        }
    }
}
