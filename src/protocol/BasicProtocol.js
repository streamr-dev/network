const { EventEmitter } = require('events')

const endpointEvents = require('../connection/WsEndpoint').events
const encoder = require('../helpers/MessageEncoder')

const { PeerBook } = require('./PeerBook')

module.exports = class BasicProtocol extends EventEmitter {
    constructor(endpoint) {
        super()

        this.endpoint = endpoint
        this.peerBook = new PeerBook()

        this.endpoint.on(endpointEvents.PEER_CONNECTED, (address, metadata) => {
            this.peerBook.add(address, metadata)
            this.onPeerConnected(this.peerBook.getPeerId(address))
        })

        this.endpoint.on(endpointEvents.MESSAGE_RECEIVED, ({ sender, message }) => {
            const senderId = this.peerBook.getPeerId(sender)
            this.onMessageReceived(encoder.decode(senderId, message), senderId)
        })

        this.endpoint.on(endpointEvents.PEER_DISCONNECTED, ({ address, reason }) => {
            this.onPeerDisconnected(this.peerBook.getPeerId(address), reason)
            this.peerBook.remove(address)
        })
    }

    // eslint-disable-next-line class-methods-use-this
    onMessageReceived(message) {
    }

    // eslint-disable-next-line class-methods-use-this
    onPeerConnected(peerId) {
    }

    // eslint-disable-next-line class-methods-use-this
    onPeerDisconnected(peerId, reason) {
    }
}
