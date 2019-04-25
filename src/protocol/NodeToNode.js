const { EventEmitter } = require('events')
const debug = require('debug')('streamr:protocol:node-node')
const ResendLastRequest = require('../messages/ResendLastRequest')
const ResendFromRequest = require('../messages/ResendFromRequest')
const ResendRangeRequest = require('../messages/ResendRangeRequest')
const ResendResponseResent = require('../messages/ResendResponseResent')
const ResendResponseResending = require('../messages/ResendResponseResending')
const ResendResponseNoResend = require('../messages/ResendResponseNoResend')
const UnicastMessage = require('../messages/UnicastMessage')
const encoder = require('../helpers/MessageEncoder')
const EndpointListener = require('./EndpointListener')
const { PeerBook, peerTypes } = require('./PeerBook')

const events = Object.freeze({
    NODE_CONNECTED: 'streamr:node-node:node-connected',
    SUBSCRIBE_REQUEST: 'streamr:node-node:subscribe-request',
    UNSUBSCRIBE_REQUEST: 'streamr:node-node:unsubscribe-request',
    DATA_RECEIVED: 'streamr:node-node:stream-data',
    NODE_DISCONNECTED: 'streamr:node-node:node-disconnected',
    RESEND_REQUEST: 'streamr:node-node:resend-request',
    RESEND_RESPONSE: 'streamr:node-node:resend-response',
    UNICAST_RECEIVED: 'streamr:node-node:unicast-received'
})

class NodeToNode extends EventEmitter {
    constructor(endpoint) {
        super()

        this.endpoint = endpoint
        this.peerBook = new PeerBook()

        this._endpointListener = new EndpointListener()
        this._endpointListener.implement(this, endpoint)
    }

    connectToNode(address) {
        return this.endpoint.connect(address).then(() => this.peerBook.getPeerId(address))
    }

    sendData(receiverNodeId, messageId, previousMessageReference, payload, signature, signatureType) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        return this.endpoint.send(
            receiverNodeAddress,
            encoder.dataMessage(messageId, previousMessageReference, payload, signature, signatureType)
        )
    }

    sendUnicast(receiverNodeId, messageId, previousMessageReference, payload, signature, signatureType, subId) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        return this.endpoint.send(
            receiverNodeAddress,
            encoder.unicastMessage(messageId, previousMessageReference, payload, signature, signatureType, subId)
        )
    }

    sendSubscribe(receiverNodeId, streamId, leechOnly) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        return this.endpoint.send(receiverNodeAddress, encoder.subscribeMessage(streamId, leechOnly))
    }

    sendUnsubscribe(receiverNodeId, streamId) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        this.endpoint.send(receiverNodeAddress, encoder.unsubscribeMessage(streamId))
    }

    requestResendLast(receiverNodeId, streamId, subId, numberLast) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        return this.endpoint.send(receiverNodeAddress, encoder.resendLastRequest(streamId, subId, numberLast))
    }

    requestResendFrom(receiverNodeId, streamId, subId, fromMsgRef, publisherId) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        return this.endpoint.send(receiverNodeAddress, encoder.resendFromRequest(streamId, subId, fromMsgRef, publisherId))
    }

    requestResendRange(receiverNodeId, streamId, subId, fromMsgRef, toMsgRef, publisherId) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        return this.endpoint.send(
            receiverNodeAddress,
            encoder.resendRangeRequest(streamId, subId, fromMsgRef, toMsgRef, publisherId)
        )
    }

    respondResending(receiverNodeId, streamId, subId) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        return this.endpoint.send(receiverNodeAddress, encoder.resendResponseResending(streamId, subId))
    }

    respondResent(receiverNodeId, streamId, subId) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        return this.endpoint.send(receiverNodeAddress, encoder.resendResponseResent(streamId, subId))
    }

    respondNoResend(receiverNodeId, streamId, subId) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        return this.endpoint.send(receiverNodeAddress, encoder.resendResponseNoResend(streamId, subId))
    }

    disconnectFromNode(receiverNodeId, reason) {
        const receiverNodeAddress = this.peerBook.getAddress(receiverNodeId)
        return this.endpoint.close(receiverNodeAddress, reason).catch((err) => {
            console.error(`Could not close connection ${receiverNodeAddress} because '${err}'`)
        })
    }

    send(receiverNodeId, message) { // TODO: better way?
        if (message instanceof ResendLastRequest) {
            return this.requestResendLast(
                receiverNodeId,
                message.getStreamId(),
                message.getSubId(),
                message.getNumberLast()
            )
        }
        if (message instanceof ResendFromRequest) {
            return this.requestResendFrom(
                receiverNodeId,
                message.getStreamId(),
                message.getSubId(),
                message.getFromMsgRef(),
                message.getPublisherId()
            )
        }
        if (message instanceof ResendRangeRequest) {
            return this.requestResendRange(
                receiverNodeId,
                message.getStreamId(),
                message.getSubId(),
                message.getFromMsgRef(),
                message.getToMsgRef(),
                message.getPublisherId()
            )
        }
        if (message instanceof ResendResponseNoResend) {
            return this.respondNoResend(
                receiverNodeId,
                message.getStreamId(),
                message.getSubId()
            )
        } if (message instanceof ResendResponseResending) {
            return this.respondResending(
                receiverNodeId,
                message.getStreamId(),
                message.getSubId()
            )
        } if (message instanceof ResendResponseResent) {
            return this.respondResent(
                receiverNodeId,
                message.getStreamId(),
                message.getSubId()
            )
        } if (message instanceof UnicastMessage) {
            return this.sendUnicast(
                receiverNodeId,
                message.getMessageId(),
                message.getPreviousMessageReference(),
                message.getData(),
                message.getSignature(),
                message.getSignatureType(),
                message.getSubId()
            )
        }
        throw new Error(`unrecognized message ${message}`)
    }

    getAddress() {
        return this.endpoint.getAddress()
    }

    stop(cb) {
        return this.endpoint.stop(cb)
    }

    onPeerConnected(peerId) {
        if (this.peerBook.isNode(peerId)) {
            this.emit(events.NODE_CONNECTED, peerId)
        }
    }

    onPeerDisconnected(peerId, reason) {
        if (this.peerBook.isNode(peerId)) {
            this.emit(events.NODE_DISCONNECTED, peerId)
        }
    }

    isStorage() {
        return this.endpoint.customHeaders.headers['streamr-peer-type'] === peerTypes.STORAGE
    }

    onMessageReceived(message) {
        switch (message.getCode()) {
            case encoder.SUBSCRIBE:
                this.emit(events.SUBSCRIBE_REQUEST, message)
                break

            case encoder.UNSUBSCRIBE:
                this.emit(events.UNSUBSCRIBE_REQUEST, message)
                break

            case encoder.DATA:
                this.emit(events.DATA_RECEIVED, message)
                break

            case encoder.UNICAST:
                this.emit(events.UNICAST_RECEIVED, message)
                break

            case encoder.RESEND_LAST:
            case encoder.RESEND_FROM:
            case encoder.RESEND_RANGE:
                this.emit(events.RESEND_REQUEST, message)
                break

            case encoder.RESEND_RESPONSE_RESENDING:
            case encoder.RESEND_RESPONSE_RESENT:
            case encoder.RESEND_RESPONSE_NO_RESEND:
                this.emit(events.RESEND_RESPONSE, message)
                break

            default:
                break
        }
    }
}

NodeToNode.events = events

module.exports = NodeToNode
