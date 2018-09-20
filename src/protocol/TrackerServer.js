const { EventEmitter } = require('events')
const { isTracker, getAddress } = require('../util')
const encoder = require('../helpers/MessageEncoder')
const EndpointListener = require('./EndpointListener')

const events = Object.freeze({
    NODE_CONNECTED: 'streamr:tracker:send-peers',
    NODE_STATUS_RECEIVED: 'streamr:tracker:peer-status',
    STREAM_INFO_REQUESTED: 'streamr:tracker:find-stream',
    NODE_LIST_REQUESTED: 'streamr:tracker:send-peers'
})

class TrackerServer extends EventEmitter {
    constructor(endpoint) {
        super()

        this.endpoint = endpoint

        this._endpointListener = new EndpointListener()
        this._endpointListener.implement(this, endpoint)
    }

    sendNodeList(receiverNode, nodeList) {
        this.endpoint.send(receiverNode, encoder.peersMessage(nodeList))
    }

    sendStreamInfo(receiverNode, streamId, nodeAddress) {
        this.endpoint.send(receiverNode, encoder.streamMessage(streamId, nodeAddress))
    }

    getAddress() {
        return getAddress(this.endpoint.node.peerInfo)
    }

    stop(cb) {
        this.endpoint.node.stop(() => cb())
    }

    // EndpointListener implementation
    onPeerConnected(peer) {
        if (!isTracker(peer)) {
            this.emit(events.NODE_CONNECTED, peer)
        }
    }

    onMessageReceived(peer, message) {
        const { code, data } = encoder.decode(message)

        switch (code) {
            case encoder.STATUS:
                this.emit(events.NODE_STATUS_RECEIVED, {
                    peer,
                    status: data
                })
                break

            case encoder.STREAM:
                this.emit(events.STREAM_INFO_REQUESTED, {
                    sender: peer,
                    streamId: data[0]
                })
                break

            case encoder.PEERS:
                this.emit(events.NODE_LIST_REQUESTED, peer)
                break

            default:
                throw new Error('Unhandled message type')
        }
    }

    async onPeerDiscovered(peer) {
    }
}

TrackerServer.events = events

module.exports = TrackerServer
