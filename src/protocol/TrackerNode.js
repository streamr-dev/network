const { EventEmitter } = require('events')

const { v4: uuidv4 } = require('uuid')
const { TrackerLayer } = require('streamr-client-protocol')

const getLogger = require('../helpers/logger')
const { decode } = require('../helpers/MessageEncoder')
const endpointEvents = require('../connection/WsEndpoint').events

const { SUB_TYPES } = require('./RtcMessages')

const events = Object.freeze({
    CONNECTED_TO_TRACKER: 'streamr:tracker-node:send-status',
    TRACKER_INSTRUCTION_RECEIVED: 'streamr:tracker-node:tracker-instruction-received',
    TRACKER_DISCONNECTED: 'streamr:tracker-node:tracker-disconnected',
    STORAGE_NODES_RESPONSE_RECEIVED: 'streamr:tracker-node:storage-nodes-received',
    RELAY_MESSAGE_RECEIVED: 'streamr:tracker-node:relay-message-received',
    RTC_ERROR_RECEIVED: 'streamr:tracker-node:rtc-error-received',
})

const eventPerType = {}
eventPerType[TrackerLayer.TrackerMessage.TYPES.InstructionMessage] = events.TRACKER_INSTRUCTION_RECEIVED
eventPerType[TrackerLayer.TrackerMessage.TYPES.StorageNodesResponse] = events.STORAGE_NODES_RESPONSE_RECEIVED
eventPerType[TrackerLayer.TrackerMessage.TYPES.RelayMessage] = events.RELAY_MESSAGE_RECEIVED
eventPerType[TrackerLayer.TrackerMessage.TYPES.ErrorMessage] = events.RTC_ERROR_RECEIVED

class TrackerNode extends EventEmitter {
    constructor(endpoint) {
        super()
        this.endpoint = endpoint
        this.endpoint.on(endpointEvents.PEER_CONNECTED, (peerInfo) => this.onPeerConnected(peerInfo))
        this.endpoint.on(endpointEvents.PEER_DISCONNECTED, (peerInfo) => this.onPeerDisconnected(peerInfo))
        this.endpoint.on(endpointEvents.MESSAGE_RECEIVED, (peerInfo, message) => this.onMessageReceived(peerInfo, message))
        this.logger = getLogger(`streamr:TrackerNode:${endpoint.peerInfo.peerId}`)
    }

    sendStatus(trackerId, status) {
        return this.send(trackerId, new TrackerLayer.StatusMessage({
            requestId: uuidv4(),
            status
        }))
    }

    sendStorageNodesRequest(trackerId, streamId) {
        return this.send(trackerId, new TrackerLayer.StorageNodesRequest({
            requestId: uuidv4(),
            streamId: streamId.id,
            streamPartition: streamId.partition
        }))
    }

    sendLocalDescription(trackerId, targetNode, originatorInfo, type, description) {
        return this.send(trackerId, new TrackerLayer.RelayMessage({
            requestId: uuidv4(),
            originator: originatorInfo,
            targetNode,
            subType: SUB_TYPES.LOCAL_DESCRIPTION,
            data: {
                type,
                description
            }
        }))
    }

    sendLocalCandidate(trackerId, targetNode, originatorInfo, candidate, mid) {
        return this.send(trackerId, new TrackerLayer.RelayMessage({
            requestId: uuidv4(),
            originator: originatorInfo,
            targetNode,
            subType: SUB_TYPES.LOCAL_CANDIDATE,
            data: {
                candidate,
                mid
            }
        }))
    }

    sendRtcConnect(trackerId, targetNode, originatorInfo) {
        return this.send(trackerId, new TrackerLayer.RelayMessage({
            requestId: uuidv4(),
            originator: originatorInfo,
            targetNode,
            subType: SUB_TYPES.RTC_CONNECT,
            data: {}
        }))
    }

    send(receiverNodeId, message) {
        return this.endpoint.send(receiverNodeId, message.serialize()).then(() => message)
    }

    stop() {
        return this.endpoint.stop()
    }

    onMessageReceived(peerInfo, rawMessage) {
        if (peerInfo.isTracker()) {
            const message = decode(rawMessage, TrackerLayer.TrackerMessage.deserialize)
            if (message != null) {
                this.emit(eventPerType[message.type], message, peerInfo.peerId)
            } else {
                this.logger.warn('TrackerNode: invalid message from %s: %s', peerInfo, rawMessage)
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

    onPeerDisconnected(peerInfo) {
        if (peerInfo.isTracker()) {
            this.emit(events.TRACKER_DISCONNECTED, peerInfo.peerId)
        }
    }
}

TrackerNode.events = events

module.exports = TrackerNode
