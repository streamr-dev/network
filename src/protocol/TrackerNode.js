const { EventEmitter } = require('events')

const encoder = require('../helpers/MessageEncoder')
const endpointEvents = require('../connection/WsEndpoint').events

const events = Object.freeze({
    CONNECTED_TO_TRACKER: 'streamr:tracker-node:send-status',
    TRACKER_INSTRUCTION_RECEIVED: 'streamr:tracker-node:tracker-instruction-received',
    TRACKER_DISCONNECTED: 'streamr:tracker-node:tracker-disconnected',
    STORAGE_NODES_RECEIVED: 'streamr:tracker-node:storage-nodes-received'
})

class TrackerNode extends EventEmitter {
    constructor(basicProtocol) {
        super()
        this.basicProtocol = basicProtocol

        this.basicProtocol.on(endpointEvents.PEER_CONNECTED, (peerId) => this.onPeerConnected(peerId))
        this.basicProtocol.on(endpointEvents.PEER_DISCONNECTED, (peerId, reason) => this.onPeerDisconnected(peerId, reason))
        this.basicProtocol.on(endpointEvents.MESSAGE_RECEIVED, (message) => this.onMessageReceived(message))
    }

    sendStatus(trackerId, status) {
        const trackerAddress = this.basicProtocol.peerBook.getAddress(trackerId)
        return this.basicProtocol.endpoint.send(trackerAddress, encoder.statusMessage(status))
    }

    findStorageNodes(trackerId, streamId) {
        const trackerAddress = this.basicProtocol.peerBook.getAddress(trackerId)
        return this.basicProtocol.endpoint.send(trackerAddress, encoder.findStorageNodesMessage(streamId))
    }

    stop() {
        this.basicProtocol.endpoint.stop()
    }

    onMessageReceived(message) {
        switch (message.getCode()) {
            case encoder.INSTRUCTION:
                this.emit(events.TRACKER_INSTRUCTION_RECEIVED, message)
                break
            case encoder.STORAGE_NODES:
                this.emit(events.STORAGE_NODES_RECEIVED, message)
                break
            default:
                break
        }
    }

    connectToTracker(trackerAddress) {
        return this.basicProtocol.endpoint.connect(trackerAddress)
    }

    onPeerConnected(peerId) {
        if (this.basicProtocol.peerBook.isTracker(peerId)) {
            this.emit(events.CONNECTED_TO_TRACKER, peerId)
        }
    }

    onPeerDisconnected(peerId, reason) {
        if (this.basicProtocol.peerBook.isTracker(peerId)) {
            this.emit(events.TRACKER_DISCONNECTED, peerId)
        }
    }
}

TrackerNode.events = events

module.exports = TrackerNode
