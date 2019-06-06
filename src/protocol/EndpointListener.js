const endpointEvents = require('../connection/Endpoint').events
const encoder = require('../helpers/MessageEncoder')
const { PeerBook } = require('./PeerBook')

module.exports = class EndpointListener {
    // eslint-disable-next-line class-methods-use-this
    implement(implementor, endpoint) {
        if (typeof implementor.onPeerConnected !== 'function') {
            throw new Error('onPeerConnected() method not found in class implementing EndpointListener')
        }
        if (typeof implementor.onMessageReceived !== 'function') {
            throw new Error('onMessageReceived() method not found in class implementing EndpointListener')
        }
        if (typeof implementor.onPeerDisconnected !== 'function') {
            throw new Error('onPeerDisconnected() method not found in class implementing EndpointListener')
        }
        if (typeof implementor.peerBook instanceof PeerBook) {
            throw new Error('instance variable peerBook of type PeerBook not found in class implementing EndpointListener')
        }

        endpoint.on(endpointEvents.PEER_CONNECTED, (address, metadata) => {
            implementor.peerBook.add(address, metadata)
            implementor.onPeerConnected(implementor.peerBook.getPeerId(address))
        })

        endpoint.on(endpointEvents.MESSAGE_RECEIVED, ({ sender, message }) => {
            const senderId = implementor.peerBook.getPeerId(sender)
            implementor.onMessageReceived(encoder.decode(senderId, message), senderId)
        })

        endpoint.on(endpointEvents.PEER_DISCONNECTED, ({ address, reason }) => {
            implementor.onPeerDisconnected(implementor.peerBook.getPeerId(address), reason)
            implementor.peerBook.remove(address)
        })
    }
}
