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
    private stopPolling?: () => void

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

    async start(): Promise<void> {
        if (this.pollInterval > 0) {
            const { stop } = await scheduleAtInterval(() => this.tryPoll(), this.pollInterval, true)
            this.stopPolling = stop
        } else {
            await this.tryPoll()
        }
    }

    async poll(): Promise<void> {
        logger.info('polling...')
        const { streams, blockNumber } = await this.streamrClient.getStoredStreams(this.clusterId)
        logger.info('found %d streams at block %d', streams.length, blockNumber)
        this.onNewSnapshot(streams, blockNumber)
    }

    destroy(): void {
        this.stopPolling?.()
    }

    private async tryPoll(): Promise<void> {
        try {
            await this.poll()
        } catch (err) {
            logger.warn(`error when trying to poll full state: ${err}`)
        }
    }
}
