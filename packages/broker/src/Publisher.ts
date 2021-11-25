import { FailedToPublishError } from './errors/FailedToPublishError'
import type { StreamrClient } from 'streamr-client'
import type { StreamMessage } from 'streamr-client-protocol'
import type { Metrics, MetricsContext } from 'streamr-network'

const THRESHOLD_FOR_FUTURE_MESSAGES_IN_MS = 300 * 1000

const isTimestampTooFarInTheFuture = (timestamp: number): boolean => {
    return timestamp > Date.now() + THRESHOLD_FOR_FUTURE_MESSAGES_IN_MS
}

export class Publisher {
    private metrics: Metrics
    private client: StreamrClient

    constructor(client: StreamrClient, metricsContext: MetricsContext) {
        this.client = client
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
