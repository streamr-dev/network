const { StreamMessage } = require('streamr-client-protocol').MessageLayer

const { MessageNotSignedError, MessageNotEncryptedError } = require('./errors/MessageNotSignedError')
const FailedToPublishError = require('./errors/FailedToPublishError')
const { isTimestampTooFarInTheFuture } = require('./helpers/utils')
const VolumeLogger = require('./VolumeLogger')

module.exports = class Publisher {
    constructor(networkNode, thresholdForFutureMessageSeconds, volumeLogger = new VolumeLogger(0)) {
        this.networkNode = networkNode
        this.volumeLogger = volumeLogger
        this._thresholdForFutureMessageSeconds = thresholdForFutureMessageSeconds
    }

    publish(stream, streamMessage) {
        if (stream.requireSignedData && !streamMessage.signature) {
            throw new MessageNotSignedError('This stream requires published data to be signed.')
        }

        if (stream.requireEncryptedData && streamMessage.encryptionType === StreamMessage.ENCRYPTION_TYPES.NONE) {
            throw new MessageNotEncryptedError('This stream requires published data to be encrypted.')
        }

        if (isTimestampTooFarInTheFuture(streamMessage.getTimestamp(), this._thresholdForFutureMessageSeconds)) {
            throw new FailedToPublishError(streamMessage.getStreamId(), `future timestamps are not allowed, max allowed +${this._thresholdForFutureMessageSeconds} seconds`)
        }

        this.volumeLogger.logInput(streamMessage.getContent().length)

        this.networkNode.publish(streamMessage)
    }
}
