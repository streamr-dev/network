import { Stream, StreamrClient } from 'streamr-client'
import { Logger, scheduleAtInterval } from '@streamr/utils'

const logger = new Logger(module)

/**
 * Polls full state of storage node assignments on an interval.
 */
export class StoragePoller {
    private readonly clusterId: string
    private readonly pollInterval: number
    private readonly streamrClient: StreamrClient
    private readonly onNewSnapshot: (streams: Stream[], block: number) => void

    constructor(
        clusterId: string,
        pollInterval: number,
        streamrClient: StreamrClient,
        onNewSnapshot: (streams: Stream[], block: number) => void
    ) {
        this.clusterId = clusterId
        this.pollInterval = pollInterval
        this.streamrClient = streamrClient
        this.onNewSnapshot = onNewSnapshot
    }

    async start(abortSignal: AbortSignal): Promise<void> {
        if (this.pollInterval > 0) {
            await scheduleAtInterval(() => this.tryPoll(), this.pollInterval, true, abortSignal)
        } else {
            await this.tryPoll()
        }
    }

    async poll(): Promise<void> {
        logger.info('Polling')
        const { streams, blockNumber } = await this.streamrClient.getStoredStreams(this.clusterId)
        logger.info('Polled', {
            foundStreams: streams.length,
            blockNumber
        })
        this.onNewSnapshot(streams, blockNumber)
    }

    private async tryPoll(): Promise<void> {
        try {
            await this.poll()
        } catch (err) {
            logger.warn('Failed to poll full state', err)
        }
    }
}
