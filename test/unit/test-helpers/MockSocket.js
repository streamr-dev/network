const events = require('events')

module.exports = class MockSocket extends events.EventEmitter {
    constructor() {
        super()
        this.rooms = []
        this.sentMessages = []
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
