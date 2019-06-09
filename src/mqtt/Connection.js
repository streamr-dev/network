const debug = require('debug')('streamr:Connection:mqtt')

module.exports = class Connection {
    constructor(client, clientId) {
        this.id = clientId
        this.client = client
        this.streams = []
    }

    addStream(stream) {
        this.streams.push(stream)
    }

    removeStream(streamId, streamPartition) {
        const i = this.streams.findIndex((s) => s.id === streamId && s.partition === streamPartition)
        if (i !== -1) {
            this.streams.splice(i, 1)
        }
    }

    forEachStream(cb) {
        this.getStreams().forEach(cb)
    }

    getStreams() {
        return this.streams.slice() // return copy
    }

    streamsAsString() {
        return this.streams.map((s) => s.toString())
    }
}

