const { EventEmitter } = require('events')
const encoder = require('../helpers/MessageEncoder')
const EndpointListener = require('./EndpointListener')

const events = Object.freeze({
    NODE_CONNECTED: 'streamr:tracker:send-peers',
    NODE_STATUS_RECEIVED: 'streamr:tracker:peer-status',
    STREAM_INFO_REQUESTED: 'streamr:tracker:find-stream',
    NODE_DISCONNECTED: 'streamr:tracker:node-disconnected'
})

class TrackerServer extends EventEmitter {
    constructor(endpoint) {
        super()

        this.endpoint = endpoint

        this._endpointListener = new EndpointListener()
        this._endpointListener.implement(this, endpoint)
    }

    sendStreamInfo(receiverNode, streamId, nodeAddresses) {
        this.endpoint.send(receiverNode, encoder.streamMessage(streamId, nodeAddresses))
    }

    getAddress() {
        return this.endpoint.getAddress()
    }

    stop(cb) {
        this.endpoint.stop(cb)
    }

    onPeerConnected(peer) {
        this.emit(events.NODE_CONNECTED, peer)
    }

    onMessageReceived(message) {
        switch (message.getCode()) {
            case encoder.STATUS:
                this.emit(events.NODE_STATUS_RECEIVED, message)
                break

            case encoder.STREAM:
                this.emit(events.STREAM_INFO_REQUESTED, message)
                break
            default:
                break
        }
    }

    async onPeerDisconnected(node) {
        this.emit(events.NODE_DISCONNECTED, node)
    }
}

TrackerServer.events = events

module.exports = TrackerServer
