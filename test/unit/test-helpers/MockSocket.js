const events = require('events')
const { ControlLayer } = require('streamr-client-protocol')

module.exports = class MockSocket extends events.EventEmitter {
    constructor(controlLayerVersion = 1, messageLayerVersion = 29) {
        super()
        this.rooms = []
        this.sentMessages = []
        this.throwOnError = true
        this.upgradeReq = {
            url: `some-url?controlLayerVersion=${controlLayerVersion}&messageLayerVersion=${messageLayerVersion}`,
        }
    }

    join(channel, cb) {
        this.rooms.push(channel)
        console.log(`SOCKET MOCK: Socket ${this.id} joined channel ${channel}, now on: ${this.rooms}`)
        cb()
    }

    receive(requestObject) {
        if (requestObject.serialize != null) {
            this.emit('message', requestObject.serialize())
        } else {
            throw new Error(`Unexpected argument to MockSocket.receive: ${JSON.stringify(requestObject)}`)
        }
    }

    receiveRaw(stringOrObject) {
        this.emit('message', JSON.stringify(stringOrObject))
    }

    send(response) {
        if (typeof response !== 'string') {
            throw new Error(`Tried to send a non-string to the socket: ${response}`)
        }
        this.sentMessages.push(response)

        // Inspect the message to catch errors
        const msg = ControlLayer.ControlMessage.deserialize(response)

        // If you expect error messages, set mockSocket.throwOnError to false for those tests
        if (msg instanceof ControlLayer.ErrorResponse && this.throwOnError) {
            throw new Error(`Received unexpected error message: ${msg.errorMessage}`)
        }
    }

    getRequest() {
        return this.upgradeReq
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
