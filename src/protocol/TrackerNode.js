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
    constructor(endpoint) {
        super()
        this.endpoint = endpoint
        this.endpoint.on(endpointEvents.PEER_CONNECTED, (peerInfo) => this.onPeerConnected(peerInfo))
        this.endpoint.on(endpointEvents.PEER_DISCONNECTED, (peerInfo, reason) => this.onPeerDisconnected(peerInfo, reason))
        this.endpoint.on(endpointEvents.MESSAGE_RECEIVED, (peerInfo, message) => this.onMessageReceived(peerInfo, message))
    }

    sendStatus(trackerId, status) {
        return this.endpoint.send(trackerId, encoder.statusMessage(status))
    }

    findStorageNodes(trackerId, streamId) {
        return this.endpoint.send(trackerId, encoder.findStorageNodesMessage(streamId))
    }

    stop() {
        this.endpoint.stop()
    }

    onMessageReceived(peerInfo, rawMessage) {
        const message = encoder.decode(peerInfo.peerId, rawMessage)
        if (message) {
            switch (message.getCode()) {
                case encoder.INSTRUCTION:
                    this.emit(events.TRACKER_INSTRUCTION_RECEIVED, peerInfo.peerId, message)
                    break
                case encoder.STORAGE_NODES:
                    this.emit(events.STORAGE_NODES_RECEIVED, message)
                    break
                default:
                    break
            }
        }
    }

    connectToTracker(trackerAddress) {
        return this.endpoint.connect(trackerAddress)
    }

    onPeerConnected(peerInfo) {
        if (peerInfo.isTracker()) {
            this.emit(events.CONNECTED_TO_TRACKER, peerInfo.peerId)
        }
    }

    onPeerDisconnected(peerInfo, reason) {
        if (peerInfo.isTracker()) {
            this.emit(events.TRACKER_DISCONNECTED, peerInfo.peerId)
        }
    }
}

TrackerNode.events = events

module.exports = TrackerNode
