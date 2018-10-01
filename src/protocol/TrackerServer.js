const { EventEmitter } = require('events')
const { isTracker, getAddress } = require('../util')
const encoder = require('../helpers/MessageEncoder')
const endpointEvents = require('../connection/Libp2pEndpoint').events
const EndpointListener = require('./EndpointListener')

const events = Object.freeze({
    NODE_CONNECTED: 'streamr:tracker:send-peers',
    NODE_STATUS_RECEIVED: 'streamr:tracker:peer-status',
    STREAM_INFO_REQUESTED: 'streamr:tracker:find-stream',
    NODE_LIST_REQUESTED: 'streamr:tracker:send-peers',
    NODE_DISCONNECTED: 'streamr:tracker:node-disconnected'
})

class TrackerServer extends EventEmitter {
    constructor(endpoint) {
        super()

        this.endpoint = endpoint

        this._endpointListener = new EndpointListener()
        this._endpointListener.implement(this, endpoint)

        this.endpoint.on(endpointEvents.PEER_DISCONNECTED, (peer) => this.onPeerDisconnected(peer))
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

    onPeerConnected(peer) {
        if (!isTracker(peer)) {
            this.emit(events.NODE_CONNECTED, peer)
        }
    }

    onMessageReceived(message) {
        switch (message.getCode()) {
            case encoder.STATUS:
                this.emit(events.NODE_STATUS_RECEIVED, message)
                break

            case encoder.STREAM:
                this.emit(events.STREAM_INFO_REQUESTED, message)
                break

            case encoder.PEERS:
                this.emit(events.NODE_LIST_REQUESTED, message.getSource())
                break

            default:
                break
        }
    }

    async onPeerDiscovered(peer) {
    }

    async onPeerDisconnected(node) {
        this.emit(events.NODE_DISCONNECTED, node)
    }
}

TrackerServer.events = events

module.exports = TrackerServer
