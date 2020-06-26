const events = require('events')

const { ControlLayer } = require('streamr-network').Protocol

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

        this.emit('test:send', this.sentMessages.length)
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
        cb()
    }
}
