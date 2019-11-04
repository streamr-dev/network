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
    constructor(basicProtocol) {
        super()
        this.basicProtocol = basicProtocol

        this.basicProtocol.on(endpointEvents.PEER_CONNECTED, (peerId) => this.onPeerConnected(peerId))
        this.basicProtocol.on(endpointEvents.PEER_DISCONNECTED, (peerId, reason) => this.onPeerDisconnected(peerId, reason))
        this.basicProtocol.on(endpointEvents.MESSAGE_RECEIVED, (message) => this.onMessageReceived(message))
    }

    sendInstruction(receiverNodeId, streamId, listOfNodeIds) {
        const receiverNodeAddress = this.basicProtocol.peerBook.getAddress(receiverNodeId)
        const listOfNodeAddresses = listOfNodeIds.map((nodeId) => this.basicProtocol.peerBook.getAddress(nodeId))
        return this.basicProtocol.endpoint.send(receiverNodeAddress, encoder.instructionMessage(streamId, listOfNodeAddresses))
    }

    sendStorageNodes(receiverNodeId, streamId, listOfNodeIds) {
        const receiverNodeAddress = this.basicProtocol.peerBook.getAddress(receiverNodeId)
        const listOfNodeAddresses = listOfNodeIds.map((nodeId) => this.basicProtocol.peerBook.getAddress(nodeId))
        return this.basicProtocol.endpoint.send(receiverNodeAddress, encoder.storageNodesMessage(streamId, listOfNodeAddresses))
    }

    getAddress() {
        return this.basicProtocol.endpoint.getAddress()
    }

    stop() {
        return this.basicProtocol.endpoint.stop()
    }

    onPeerConnected(peerId) {
        const nodeType = this.basicProtocol.peerBook.getTypeById(peerId)
        if (this.basicProtocol.peerBook.isNode(peerId)) {
            this.emit(events.NODE_CONNECTED, {
                peerId, nodeType
            })
        }
    }

    onPeerDisconnected(peerId, reason) {
        const nodeType = this.basicProtocol.peerBook.getTypeById(peerId)

        if (this.basicProtocol.peerBook.isNode(peerId)) {
            this.emit(events.NODE_DISCONNECTED, {
                peerId, nodeType
            })
        }
    }

    onMessageReceived(message) {
        const nodeType = this.basicProtocol.peerBook.getTypeById(message.getSource())
        switch (message.getCode()) {
            case encoder.STATUS:
                this.emit(events.NODE_STATUS_RECEIVED, {
                    statusMessage: message, nodeType
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
