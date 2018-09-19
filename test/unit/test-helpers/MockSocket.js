const events = require('events')
const encoder = require('../../../src/MessageEncoder')

module.exports = class MockSocket extends events.EventEmitter {
    constructor(id) {
        super()
        this.id = id
        this.rooms = []
        this.sentMessages = []
        this.throwOnError = true
    }

    join(channel, cb) {
        this.rooms.push(channel)
        console.log(`SOCKET MOCK: Socket ${this.id} joined channel ${channel}, now on: ${this.rooms}`)
        cb()
    }

    receive(message) {
        this.emit('message', JSON.stringify(message))
    }

    send(message) {
        this.sentMessages.push(message)

        // Inspect the message to catch errors
        const parsedMessage = JSON.parse(message)

        // If you expect error messages, set mockSocket.throwOnError to false for those tests
        if (parsedMessage[1] === encoder.BROWSER_MSG_TYPE_ERROR && this.throwOnError) {
            throw new Error(`Received unexpected error message: ${parsedMessage[3]}`)
        }
    }

    disconnect() {
        this.emit('close')
    }

    leave(channel, cb) {
        const index = this.rooms.indexOf(channel)
        if (index >= 0) {
            this.rooms.splice(index, 1)
        }

        console.log(`SOCKET MOCK: Socket ${this.id} left channel ${channel}, now on: ${this.rooms}`)
        cb()
    }
}
