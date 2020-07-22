const VolumeLogger = require('./VolumeLogger')
const FailedToPublishError = require('./errors/FailedToPublishError')
const { isTimestampTooFarInTheFuture } = require('./helpers/utils')

module.exports = class Publisher {
    constructor(networkNode, streamMessageValidator, thresholdForFutureMessageSeconds, volumeLogger = new VolumeLogger(0)) {
        this.networkNode = networkNode
        this.streamMessageValidator = streamMessageValidator
        this.volumeLogger = volumeLogger
        this._thresholdForFutureMessageSeconds = thresholdForFutureMessageSeconds

        if (!networkNode) {
            throw new Error('No networkNode defined!')
        }
        if (!streamMessageValidator) {
            throw new Error('No streamMessageValidator defined!')
        }
        if (!volumeLogger) {
            throw new Error('No volumeLogger defined!')
        }
    }

    async validateAndPublish(streamMessage) {
        if (isTimestampTooFarInTheFuture(streamMessage.getTimestamp(), this._thresholdForFutureMessageSeconds)) {
            throw new FailedToPublishError(streamMessage.getStreamId(), `future timestamps are not allowed, max allowed +${this._thresholdForFutureMessageSeconds} seconds`)
        }

        // Only publish valid messages
        await this.streamMessageValidator.validate(streamMessage)

        // This throws if content not valid JSON
        streamMessage.getContent(true)

        this.volumeLogger.logInput(streamMessage.getContent(false).length)
        this.networkNode.publish(streamMessage)
    }
}
