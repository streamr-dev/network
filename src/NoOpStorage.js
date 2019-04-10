const { Readable } = require('stream')

module.exports = class NoOpStorage {
    requestLast() {
        const stream = new Readable({
            objectMode: true
        })
        stream.push(null)
        return stream
    }

    requestFrom() {
        const stream = new Readable({
            objectMode: true
        })
        stream.push(null)
        return stream
    }

    requestRange() {
        const stream = new Readable({
            objectMode: true
        })
        stream.push(null)
        return stream
    }
}
