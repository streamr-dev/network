const { Transform } = require('stream')
const ResendLastRequest = require('../messages/ResendLastRequest')
const ResendFromRequest = require('../messages/ResendFromRequest')
const ResendRangeRequest = require('../messages/ResendRangeRequest')
const UnicastMessage = require('../../src/messages/UnicastMessage')
const { MessageID, MessageReference } = require('../../src/identifiers')

function toUnicastMessage(request) {
    return new Transform({
        objectMode: true,
        transform: (streamData, _, done) => {
            const {
                timestamp,
                sequenceNo,
                publisherId,
                msgChainId,
                previousTimestamp,
                previousSequenceNo,
                data,
                signature,
                signatureType,
            } = streamData
            done(null, new UnicastMessage(
                new MessageID(request.getStreamId(), timestamp, sequenceNo, publisherId, msgChainId),
                previousTimestamp != null ? new MessageReference(previousTimestamp, previousSequenceNo) : null,
                data,
                signature,
                signatureType,
                request.getSubId()
            ))
        }
    })
}

/**
 * Resend strategy that uses fetches streaming data from (local) storage.
 * Often used at L1.
 */
class StorageResendStrategy {
    constructor(storage) {
        if (storage == null) {
            throw new Error('storage not given')
        }
        this.storage = storage
    }

    getResendResponseStream(request) {
        const { id, partition } = request.getStreamId()

        if (request instanceof ResendLastRequest) {
            return this.storage.requestLast(
                id,
                partition,
                request.getNumberLast()
            ).pipe(toUnicastMessage(request))
        }
        if (request instanceof ResendFromRequest) {
            const fromMsgRef = request.getFromMsgRef()
            return this.storage.requestFrom(
                id,
                partition,
                fromMsgRef.timestamp,
                fromMsgRef.sequenceNo,
                request.getPublisherId()
            ).pipe(toUnicastMessage(request))
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
            ).pipe(toUnicastMessage(request))
        }
        throw new Error(`unknown resend request ${request}`)
    }
}

module.exports = {
    StorageResendStrategy
}
