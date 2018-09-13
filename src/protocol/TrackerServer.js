const { EventEmitter } = require('events')
const debug = require('debug')('streamr:tracker-server')
const connectionEvents = require('../connection/Connection').events
const { isTracker, getAddress } = require('../util')
const encoder = require('../helpers/MessageEncoder')

const events = Object.freeze({
    NODE_CONNECTED: 'streamr:tracker:send-peers',
    NODE_STATUS_RECEIVED: 'streamr:tracker:peer-status',
    STREAM_INFO_REQUESTED: 'streamr:tracker:find-stream',
    NODE_LIST_REQUESTED: 'streamr:tracker:send-peers'
})

class TrackerServer extends EventEmitter {
    constructor(connection) {
        super()

        this.connection = connection

        this.connection.on(connectionEvents.PEER_CONNECTED, (peer) => this._onNewConnection(peer))
        this.connection.on(connectionEvents.MESSAGE_RECEIVED, ({ sender, message }) => this._onReceive(sender, message))
    }

    sendNodeList(receiverNode, nodeList) {
        this.connection.send(receiverNode, encoder.peersMessage(nodeList))
    }

    sendStreamInfo(receiverNode, streamId, nodeAddress) {
        this.connection.send(receiverNode, encoder.streamMessage(streamId, nodeAddress))
    }

    _onNewConnection(peer) {
        if (!isTracker(peer)) {
            this.emit(events.NODE_CONNECTED, peer)
        }
    }

    _onReceive(peer, message) {
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

    getAddress() {
        return getAddress(this.connection.node.peerInfo)
    }

    stop(cb) {
        this.connection.node.stop(() => cb())
    }
}

TrackerServer.events = events

module.exports = TrackerServer
