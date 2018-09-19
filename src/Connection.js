const events = require('events')
const debug = require('debug')('streamr:Connection')
const encoder = require('./MessageEncoder')

module.exports = class Connection extends events.EventEmitter {
    constructor(socket) {
        super()
        this.id = socket.id
        this.socket = socket
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

    sendBroadcast(msg) {
        this.socket.send(encoder.broadcastMessage(msg))
    }

    sendUnicast(msg, subId) {
        this.socket.send(encoder.unicastMessage(msg, subId))
    }

    sendSubscribed(response) {
        debug('sendSubscribed (%s): %o', this.id, response)
        this.socket.send(encoder.subscribedMessage(response))
    }

    sendUnsubscribed(response) {
        this.socket.send(encoder.unsubscribedMessage(response))
    }

    sendResending(response) {
        this.socket.send(encoder.resendingMessage(response))
    }

    sendResent(response) {
        this.socket.send(encoder.resentMessage(response))
    }

    sendNoResend(response) {
        this.socket.send(encoder.noResendMessage(response))
    }

    sendError(response) {
        debug('sendError (%s): %o', this.id, response)
        this.socket.send(encoder.errorMessage(response))
    }

    streamsAsString() {
        return this.streams.map((s) => `${s.id}:${s.partition}`)
    }
}

