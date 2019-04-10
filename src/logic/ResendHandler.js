const { EventEmitter } = require('events')
const ResendLastRequest = require('../messages/ResendLastRequest')
const ResendFromRequest = require('../messages/ResendFromRequest')
const ResendRangeRequest = require('../messages/ResendRangeRequest')
const { MessageID, MessageReference } = require('../identifiers')

const events = Object.freeze({
    NO_RESEND: 'streamr:resendHandler:no-resend',
    RESENDING: 'streamr:resendHandler:resending',
    RESENT: 'streamr:resendHandler:resent',
    UNICAST: 'streamr:resendHandler:unicast',
    ERROR: 'streamr:resendHandler:error'
})

class ResendHandler extends EventEmitter {
    constructor(storage) {
        super()
        if (storage == null) {
            throw new Error('storage not given')
        }
        this.storage = storage
    }

    handleRequest(request) {
        const storageStream = this._getStorageStream(request)
        this._attachEventEmittingListeners(storageStream, request)
    }

    _getStorageStream(request) {
        const { id, partition } = request.getStreamId()

        if (request instanceof ResendLastRequest) {
            return this.storage.requestLast(
                id,
                partition,
                request.getNumberLast()
            )
        }
        if (request instanceof ResendFromRequest) {
            const fromMsgRef = request.getFromMsgRef()
            return this.storage.requestFrom(
                id,
                partition,
                fromMsgRef.timestamp,
                fromMsgRef.sequenceNo,
                request.getPublisherId()
            )
        }
        if (request instanceof ResendRangeRequest) {
            const fromMsgRef = request.getFromMsgRef()
            const toMsgRef = request.getToMsgRef()
            return this.storage.requestRange(
                id,
                partition,
                fromMsgRef.timestamp,
                fromMsgRef.sequenceNo,
                toMsgRef.timestamp,
                toMsgRef.sequenceNo,
                request.getPublisherId()
            )
        }
        throw new Error(`unknown resend request ${request}`)
    }

    _attachEventEmittingListeners(storageStream, request) {
        const streamId = request.getStreamId()
        const subId = request.getSubId()
        const source = request.getSource()

        let numOfMessages = 0

        storageStream.once('data', () => {
            this.emit(events.RESENDING, {
                streamId,
                subId,
                source
            })
        })

        storageStream.on('data', () => {
            numOfMessages += 1
        })

        storageStream.on('data', ({
            timestamp,
            sequenceNo,
            publisherId,
            msgChainId,
            previousTimestamp,
            previousSequenceNo,
            data,
            signature,
            signatureType
        }) => {
            this.emit(events.UNICAST, {
                messageId: new MessageID(streamId, timestamp, sequenceNo, publisherId, msgChainId),
                previousMessageReference: previousTimestamp != null ? new MessageReference(previousTimestamp, previousSequenceNo) : null,
                data,
                signature,
                signatureType,
                subId,
                source
            })
        })

        storageStream.on('end', () => {
            this.emit(numOfMessages === 0 ? events.NO_RESEND : events.RESENT, {
                streamId,
                subId,
                source
            })
        })

        storageStream.on('error', (error) => {
            this.emit(events.ERROR, {
                streamId,
                subId,
                error,
                source
            })
        })
    }
}

ResendHandler.events = events

module.exports = ResendHandler
