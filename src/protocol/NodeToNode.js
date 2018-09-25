const { EventEmitter } = require('events')
const debug = require('debug')('streamr:protocol:node-node')
const encoder = require('../helpers/MessageEncoder')
const { getAddress } = require('../util')
const EndpointListener = require('./EndpointListener')

const events = Object.freeze({
    SUBSCRIBE_REQUEST: 'streamr:node-node:subscribe-request',
    UNSUBSCRIBE_REQUEST: 'streamr:node-node:unsubscribe-request',
    DATA_RECEIVED: 'streamr:node-node:stream-data'
})

class NodeToNode extends EventEmitter {
    constructor(endpoint) {
        super()
        this.endpoint = endpoint

        this._endpointListener = new EndpointListener()
        this._endpointListener.implement(this, endpoint)
    }

    connectToNodes(nodes) {
        nodes.forEach((node) => {
            debug('connecting to new node %s', node)
            this.endpoint.connect(node)
        })
    }

    sendData(receiverNode, streamId, data) {
        this.endpoint.send(receiverNode, encoder.dataMessage(streamId, data))
    }

    sendSubscribe(receiverNode, streamId) {
        this.endpoint.send(receiverNode, encoder.subscribeMessage(streamId))
    }

    sendUnsubscribe(receiverNode, streamId) {
        this.endpoint.send(receiverNode, encoder.unsubscribeMessage(streamId))
    }

    getAddress() {
        return getAddress(this.endpoint.node.peerInfo)
    }

    stop(cb) {
        this.endpoint.node.stop(() => cb())
    }

    // EndpointListener implementation

    onPeerConnected(peer) {
    }

    onMessageReceived(sender, message) {
        const { code, data } = encoder.decode(message)

        switch (code) {
            case encoder.SUBSCRIBE:
                this.emit(events.SUBSCRIBE_REQUEST, {
                    streamId: data,
                    sender
                })
                break

            case encoder.UNSUBSCRIBE:
                this.emit(events.UNSUBSCRIBE_REQUEST, {
                    streamId: data,
                    sender
                })
                break

            case encoder.DATA:
                this.emit(events.DATA_RECEIVED, {
                    streamId: data[0],
                    data: data[1]
                })
                break

            default:
                break
        }
    }

    async onPeerDiscovered(peer) {
    }

    async onPeerDisconnected(peer) {
    }
}

NodeToNode.events = events

module.exports = NodeToNode
