const FailedToPublishError = require('./errors/FailedToPublishError')
const { isTimestampTooFarInTheFuture } = require('./helpers/utils')

module.exports = class Publisher {
    constructor(networkNode, streamMessageValidator, thresholdForFutureMessageSeconds, metricsContext) {
        if (!networkNode) {
            throw new Error('No networkNode defined!')
        }
        if (!streamMessageValidator) {
            throw new Error('No streamMessageValidator defined!')
        }
        if (!metricsContext) {
            throw new Error('No metricsContext defined!')
        }
        this.networkNode = networkNode
        this.streamMessageValidator = streamMessageValidator
        this.thresholdForFutureMessageSeconds = thresholdForFutureMessageSeconds
        this.metrics = metricsContext.create('broker/publisher')
            .addRecordedMetric('bytes')
            .addRecordedMetric('messages')
    }

    async validateAndPublish(streamMessage) {
        if (isTimestampTooFarInTheFuture(streamMessage.getTimestamp(), this.thresholdForFutureMessageSeconds)) {
            throw new FailedToPublishError(
                streamMessage.getStreamId(), `future timestamps are not allowed, max allowed +${this.thresholdForFutureMessageSeconds} seconds`
            )
        }

        // Only publish valid messages
        await this.streamMessageValidator.validate(streamMessage)

        // This throws if content not valid JSON
        streamMessage.getContent(true)

        this.metrics.record('bytes', streamMessage.getContent(false).length)
        this.metrics.record('messages', 1)
        this.networkNode.publish(streamMessage)
    }
}
