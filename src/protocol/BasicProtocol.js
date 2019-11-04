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
            const peerId = this.peerBook.add(address, metadata)
            this.emit(endpointEvents.PEER_CONNECTED, peerId)
        })

        this.endpoint.on(endpointEvents.PEER_DISCONNECTED, (address, reason) => {
            const peerId = this.peerBook.getPeerId(address)

            this.emit(endpointEvents.PEER_DISCONNECTED, peerId, reason)
        })

        this.endpoint.on(endpointEvents.MESSAGE_RECEIVED, (address, message) => {
            const peerId = this.peerBook.getPeerId(address)
            const decodedMessage = encoder.decode(peerId, message)

            this.emit(endpointEvents.MESSAGE_RECEIVED, decodedMessage)
        })
    }
}
