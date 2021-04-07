const FailedToPublishError = require('./errors/FailedToPublishError')

const THRESHOLD_FOR_FUTURE_MESSAGES_IN_MS = 300 * 1000

const isTimestampTooFarInTheFuture = (timestamp) => {
    return timestamp > Date.now() + THRESHOLD_FOR_FUTURE_MESSAGES_IN_MS
}

module.exports = class Publisher {
    constructor(networkNode, streamMessageValidator, metricsContext) {
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
        this.metrics = metricsContext.create('broker/publisher')
            .addRecordedMetric('bytes')
            .addRecordedMetric('messages')
    }

    async validateAndPublish(streamMessage) {
        if (isTimestampTooFarInTheFuture(streamMessage.getTimestamp())) {
            throw new FailedToPublishError(
                streamMessage.getStreamId(),
                `future timestamps are not allowed, max allowed +${THRESHOLD_FOR_FUTURE_MESSAGES_IN_MS} ms`
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
