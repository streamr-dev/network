const endpointEvents = require('../connection/Endpoint').events
const encoder = require('../helpers/MessageEncoder')

module.exports = class EndpointListener {
    implement(implementor, endpoint) {
        if (typeof implementor.onPeerConnected !== 'function') {
            throw new Error('onPeerConnected() method not found in class implementing EndpointListener')
        }
        if (typeof implementor.onMessageReceived !== 'function') {
            throw new Error('onMessageReceived() method not found in class implementing EndpointListener')
        }
        if (typeof implementor.onPeerDiscovered !== 'function') {
            throw new Error('onPeerDiscovered() method not found in class implementing EndpointListener')
        }

        if (typeof implementor.onPeerDisconnected !== 'function') {
            throw new Error('onPeerDisconnected() method not found in class implementing EndpointListener')
        }

        endpoint.on(endpointEvents.PEER_CONNECTED, (peer) => implementor.onPeerConnected(peer))
        endpoint.on(endpointEvents.MESSAGE_RECEIVED, ({ sender, message }) => implementor.onMessageReceived(encoder.decode(sender, message)))
        endpoint.on(endpointEvents.PEER_DISCOVERED, (peer) => implementor.onPeerDiscovered(peer))
        endpoint.on(endpointEvents.PEER_DISCONNECTED, (peer) => implementor.onPeerDisconnected(peer))
    }
}
