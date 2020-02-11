const { EventEmitter } = require('events')

const encoder = require('../helpers/MessageEncoder')
const endpointEvents = require('../connection/WsEndpoint').events

const events = Object.freeze({
    NODE_CONNECTED: 'streamr:tracker:send-peers',
    NODE_STATUS_RECEIVED: 'streamr:tracker:peer-status',
    NODE_DISCONNECTED: 'streamr:tracker:node-disconnected',
    FIND_STORAGE_NODES_REQUEST: 'streamr:tracker:find-storage-nodes-request'
})

class TrackerServer extends EventEmitter {
    constructor(endpoint) {
        super()
        this.endpoint = endpoint
        this.endpoint.on(endpointEvents.PEER_CONNECTED, (peerInfo) => this.onPeerConnected(peerInfo))
        this.endpoint.on(endpointEvents.PEER_DISCONNECTED, (peerInfo, reason) => this.onPeerDisconnected(peerInfo, reason))
        this.endpoint.on(endpointEvents.MESSAGE_RECEIVED, (peerInfo, message) => this.onMessageReceived(peerInfo, message))
    }

    sendInstruction(receiverNodeId, streamId, listOfNodeIds) {
        const listOfNodeAddresses = listOfNodeIds.map((nodeId) => this.endpoint.resolveAddress(nodeId))
        return this.endpoint.send(receiverNodeId, encoder.instructionMessage(streamId, listOfNodeAddresses))
    }

    sendStorageNodes(receiverNodeId, streamId, listOfNodeIds) {
        const listOfNodeAddresses = listOfNodeIds.map((nodeId) => this.endpoint.resolveAddress(nodeId))
        return this.endpoint.send(receiverNodeId, encoder.storageNodesMessage(streamId, listOfNodeAddresses))
    }

    getAddress() {
        return this.endpoint.getAddress()
    }

    stop() {
        return this.endpoint.stop()
    }

    onPeerConnected(peerInfo) {
        if (peerInfo.isNode()) {
            this.emit(events.NODE_CONNECTED, peerInfo.peerId)
        }
    }

    onPeerDisconnected(peerInfo, reason) {
        if (peerInfo.isNode()) {
            this.emit(events.NODE_DISCONNECTED, peerInfo.peerId)
        }
    }

    onMessageReceived(peerInfo, rawMessage) {
        const message = encoder.decode(peerInfo.peerId, rawMessage)
        switch (message.getCode()) {
            case encoder.STATUS:
                this.emit(events.NODE_STATUS_RECEIVED, {
                    statusMessage: message,
                    isStorage: peerInfo.isStorage()
                })
                break
            case encoder.FIND_STORAGE_NODES:
                this.emit(events.FIND_STORAGE_NODES_REQUEST, message)
                break
            default:
                break
        }
    }
}

TrackerServer.events = events

module.exports = TrackerServer
