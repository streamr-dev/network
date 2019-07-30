const encoder = require('../helpers/MessageEncoder')

const BasicProtocol = require('./BasicProtocol')

const events = Object.freeze({
    NODE_CONNECTED: 'streamr:tracker:send-peers',
    NODE_STATUS_RECEIVED: 'streamr:tracker:peer-status',
    NODE_DISCONNECTED: 'streamr:tracker:node-disconnected',
    FIND_STORAGE_NODES_REQUEST: 'streamr:tracker:find-storage-nodes-request'
})

class TrackerServer extends BasicProtocol {
    sendInstruction(receiverNodeId, streamId, listOfNodeIds) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        const listOfNodeAddresses = listOfNodeIds.map((nodeId) => this.peerBook.getAddress(nodeId))
        return this.endpoint.send(receiverNodeAddress, encoder.instructionMessage(streamId, listOfNodeAddresses))
    }

    sendStorageNodes(receiverNodeId, streamId, listOfNodeIds) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        const listOfNodeAddresses = listOfNodeIds.map((nodeId) => this.peerBook.getAddress(nodeId))
        return this.endpoint.send(receiverNodeAddress, encoder.storageNodesMessage(streamId, listOfNodeAddresses))
    }

    getAddress() {
        return this.endpoint.getAddress()
    }

    stop() {
        return this.endpoint.stop()
    }

    onPeerConnected(peerId) {
        const nodeType = this.peerBook.getTypeById(peerId)
        if (this.peerBook.isNode(peerId)) {
            this.emit(events.NODE_CONNECTED, {
                peerId, nodeType
            })
        }
    }

    onPeerDisconnected(peerId, reason) {
        const nodeType = this.peerBook.getTypeById(peerId)

        if (this.peerBook.isNode(peerId)) {
            this.emit(events.NODE_DISCONNECTED, {
                peerId, nodeType
            })
        }
    }

    onMessageReceived(message) {
        const nodeType = this.peerBook.getTypeById(message.getSource())
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
