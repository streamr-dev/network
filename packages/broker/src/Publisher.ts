import { Todo } from './types'

import { FailedToPublishError } from './errors/FailedToPublishError'
import type { StreamrClient } from 'streamr-client'
import type { StreamMessage } from 'streamr-client-protocol'

const THRESHOLD_FOR_FUTURE_MESSAGES_IN_MS = 300 * 1000

const isTimestampTooFarInTheFuture = (timestamp: Todo) => {
    return timestamp > Date.now() + THRESHOLD_FOR_FUTURE_MESSAGES_IN_MS
}

export class Publisher {
    public metrics

    constructor(
        public client: StreamrClient,
        metricsContext: Todo
    ) {
        if (!client) {
            throw new Error('No streamrClient defined!')
        }
        if (!metricsContext) {
            throw new Error('No metricsContext defined!')
        }
        this.metrics = metricsContext.create('broker/publisher')
            .addRecordedMetric('bytes')
            .addRecordedMetric('messages')
    }

    async validateAndPublish(streamMessage: StreamMessage): Promise<void> {
        if (isTimestampTooFarInTheFuture(streamMessage.getTimestamp())) {
            throw new FailedToPublishError(
                streamMessage.getStreamId(),
                `future timestamps are not allowed, max allowed +${THRESHOLD_FOR_FUTURE_MESSAGES_IN_MS} ms`
            )
        }

        // This throws if content not valid JSON
        streamMessage.getContent(true)

        this.metrics.record('bytes', streamMessage.getContent(false).length)
        this.metrics.record('messages', 1)
        await this.client.publisher.validateAndPublishStreamMessage(streamMessage)
    }
}
