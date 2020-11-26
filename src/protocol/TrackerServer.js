const { EventEmitter } = require('events')

const { v4: uuidv4 } = require('uuid')
const { TrackerLayer } = require('streamr-client-protocol')

const getLogger = require('../helpers/logger')
const { decode } = require('../helpers/MessageEncoder')
const endpointEvents = require('../connection/WsEndpoint').events

const { SUB_TYPES } = require('./RtcMessages')

const events = Object.freeze({
    NODE_CONNECTED: 'streamr:tracker:send-peers',
    NODE_STATUS_RECEIVED: 'streamr:tracker:peer-status',
    NODE_DISCONNECTED: 'streamr:tracker:node-disconnected',
    STORAGE_NODES_REQUEST: 'streamr:tracker:find-storage-nodes-request',
    RELAY_MESSAGE_RECEIVED: 'streamr:tracker:relay-message-received',
})

const eventPerType = {}
eventPerType[TrackerLayer.TrackerMessage.TYPES.StatusMessage] = events.NODE_STATUS_RECEIVED
eventPerType[TrackerLayer.TrackerMessage.TYPES.StorageNodesRequest] = events.STORAGE_NODES_REQUEST
eventPerType[TrackerLayer.TrackerMessage.TYPES.RelayMessage] = events.RELAY_MESSAGE_RECEIVED

class TrackerServer extends EventEmitter {
    constructor(endpoint) {
        super()
        this.endpoint = endpoint
        endpoint.on(endpointEvents.PEER_CONNECTED, (peerInfo) => this.onPeerConnected(peerInfo))
        endpoint.on(endpointEvents.PEER_DISCONNECTED, (peerInfo) => this.onPeerDisconnected(peerInfo))
        endpoint.on(endpointEvents.MESSAGE_RECEIVED, (peerInfo, message) => this.onMessageReceived(peerInfo, message))
        this.logger = getLogger(`streamr:TrackerServer:${endpoint.peerInfo.peerId}`)
    }

    sendInstruction(receiverNodeId, streamId, nodeIds, counter) {
        return this.send(receiverNodeId, new TrackerLayer.InstructionMessage({
            requestId: uuidv4(),
            streamId: streamId.id,
            streamPartition: streamId.partition,
            nodeIds,
            counter
        }))
    }

    sendStorageNodesResponse(receiverNodeId, streamId, nodeIds) {
        return this.send(receiverNodeId, new TrackerLayer.StorageNodesResponse({
            requestId: '', // TODO: set requestId
            streamId: streamId.id,
            streamPartition: streamId.partition,
            nodeIds
        }))
    }

    sendRtcOffer(receiverNodeId, requestId, originatorInfo, description) {
        return this.send(receiverNodeId, new TrackerLayer.RelayMessage({
            requestId,
            originator: originatorInfo,
            targetNode: receiverNodeId,
            subType: SUB_TYPES.RTC_OFFER,
            data: {
                description
            }
        }))
    }

    sendRtcAnswer(receiverNodeId, requestId, originatorInfo, description) {
        return this.send(receiverNodeId, new TrackerLayer.RelayMessage({
            requestId,
            originator: originatorInfo,
            targetNode: receiverNodeId,
            subType: SUB_TYPES.RTC_ANSWER,
            data: {
                description
            }
        }))
    }

    sendRtcConnect(receiverNodeId, requestId, originatorInfo) {
        return this.send(receiverNodeId, new TrackerLayer.RelayMessage({
            requestId,
            originator: originatorInfo,
            targetNode: receiverNodeId,
            subType: SUB_TYPES.RTC_CONNECT,
            data: {}
        }))
    }

    sendRemoteCandidate(receiverNodeId, requestId, originatorInfo, candidate, mid) {
        return this.send(receiverNodeId, new TrackerLayer.RelayMessage({
            requestId,
            originator: originatorInfo,
            targetNode: receiverNodeId,
            subType: SUB_TYPES.REMOTE_CANDIDATE,
            data: {
                candidate,
                mid
            }
        }))
    }

    sendUnknownPeerRtcError(receiverNodeId, requestId, targetNode) {
        return this.send(receiverNodeId, new TrackerLayer.ErrorMessage({
            requestId,
            errorCode: TrackerLayer.ErrorMessage.ERROR_CODES.RTC_UNKNOWN_PEER,
            targetNode
        }))
    }

    send(receiverNodeId, message) {
        return this.endpoint.send(receiverNodeId, message.serialize()).then(() => message)
    }

    getAddress() {
        return this.endpoint.getAddress()
    }

    stop() {
        return this.endpoint.stop()
    }

    onPeerConnected(peerInfo) {
        if (peerInfo.isNode()) {
            this.emit(events.NODE_CONNECTED, peerInfo.peerId, peerInfo.isStorage())
        }
    }

    onPeerDisconnected(peerInfo) {
        if (peerInfo.isNode()) {
            this.emit(events.NODE_DISCONNECTED, peerInfo.peerId, peerInfo.isStorage())
        }
    }

    onMessageReceived(peerInfo, rawMessage) {
        if (peerInfo.isNode()) {
            const message = decode(rawMessage, TrackerLayer.TrackerMessage.deserialize)
            if (message != null) {
                this.emit(eventPerType[message.type], message, peerInfo.peerId)
            } else {
                this.logger.warn('TrackerServer: invalid message from %s: %s', peerInfo, rawMessage)
            }
        }
    }
}

TrackerServer.events = events

module.exports = TrackerServer
